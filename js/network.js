/**
 * network.js – WebRTC peer-to-peer multiplayer using DataChannel.
 *
 * Architecture: Star topology.
 *   Host  – runs authoritative physics, broadcasts world state.
 *   Guest – sends local input, receives & renders world state.
 *
 * Signaling is manual: players exchange base64-encoded SDP blobs
 * (offer → answer) via any out-of-band channel (chat, QR code, etc.).
 * This requires no backend and works on GitHub Pages.
 *
 * Only STUN is used for ICE (no TURN), so it works on most home networks
 * but may fail behind strict symmetric NAT.
 */

import { STUN_SERVERS, NET_TICK_MS } from './constants.js';

// Message type tags
const MSG = {
  INPUT:  'i',  // guest → host: { steer, gas, brake }
  STATE:  's',  // host → guests: { cars: [{id,x,y,angle,speed,lap}] }
  START:  'go', // host → guests: start race
  FINISH: 'f',  // host → guests: race finished
  PING:   'p',
  PONG:   'pp',
};

export class Network {
  constructor() {
    this.isHost   = false;
    this.isGuest  = false;
    this.connected = false;

    this._pc       = null;   // RTCPeerConnection
    this._dc       = null;   // RTCDataChannel
    this._guestId  = null;   // assigned car index for this guest

    // Callbacks set by main.js
    this.onConnected    = null;  // ()
    this.onStateUpdate  = null;  // (carsArray)
    this.onInputReceived = null; // (input, carIdx) – host only
    this.onRaceStart    = null;  // ()
    this.onRaceFinish   = null;  // ()
    this.onError        = null;  // (msg)

    this._tickTimer = null;
    this._pingTime  = null;
    this.latencyMs  = 0;
  }

  // ---------------------------------------------------------------------------
  // Host flow
  // ---------------------------------------------------------------------------

  /**
   * Create a room as host.
   * Returns a Promise<string> that resolves with the base64 offer code
   * once ICE gathering is complete.
   */
  async createOffer() {
    this.isHost = true;
    this._pc = this._createPeerConnection();

    this._dc = this._pc.createDataChannel('race', {
      ordered: false,
      maxRetransmits: 0,
    });
    this._setupDataChannel(this._dc);

    const offer = await this._pc.createOffer();
    await this._pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete (vanilla ICE)
    await this._waitForIce();

    return btoa(JSON.stringify(this._pc.localDescription));
  }

  /**
   * Host: receive the guest's answer code and finalise the connection.
   * @param {string} answerCode – base64 answer from guest
   */
  async acceptAnswer(answerCode) {
    const answer = JSON.parse(atob(answerCode));
    await this._pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  // ---------------------------------------------------------------------------
  // Guest flow
  // ---------------------------------------------------------------------------

  /**
   * Join a room as guest using the host's offer code.
   * Returns a Promise<string> with the base64 answer code to send to host.
   * @param {string} offerCode – base64 offer from host
   */
  async joinRoom(offerCode) {
    this.isGuest = true;
    this._pc = this._createPeerConnection();

    this._pc.ondatachannel = (e) => {
      this._dc = e.channel;
      this._setupDataChannel(this._dc);
    };

    const offer = JSON.parse(atob(offerCode));
    await this._pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await this._pc.createAnswer();
    await this._pc.setLocalDescription(answer);

    await this._waitForIce();

    return btoa(JSON.stringify(this._pc.localDescription));
  }

  // ---------------------------------------------------------------------------
  // Host: broadcast world state to guest(s)
  // ---------------------------------------------------------------------------
  broadcastState(cars) {
    if (!this.connected || !this.isHost) return;
    this._send({
      t: MSG.STATE,
      cars: cars.map((c) => c.serialize()),
    });
  }

  // ---------------------------------------------------------------------------
  // Guest: send local input to host
  // ---------------------------------------------------------------------------
  sendInput(input) {
    if (!this.connected || !this.isGuest) return;
    this._send({ t: MSG.INPUT, ...input });
  }

  // ---------------------------------------------------------------------------
  // Host: signal all guests to start
  // ---------------------------------------------------------------------------
  broadcastStart(guestCarIdx) {
    if (!this.connected || !this.isHost) return;
    this._guestId = guestCarIdx; // unused on host but useful for debug
    this._send({ t: MSG.START, carIdx: guestCarIdx });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' ||
          pc.iceConnectionState === 'completed') {
        // Already handled by datachannel.onopen
      }
      if (pc.iceConnectionState === 'failed' ||
          pc.iceConnectionState === 'disconnected') {
        this.connected = false;
        if (this.onError) this.onError('Connection lost');
      }
    };
    return pc;
  }

  _setupDataChannel(dc) {
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      this.connected = true;
      if (this.onConnected) this.onConnected();
      this._startPing();
    };
    dc.onclose = () => {
      this.connected = false;
    };
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this._handleMessage(msg);
      } catch (_) {
        // ignore malformed messages
      }
    };
  }

  _handleMessage(msg) {
    switch (msg.t) {
      case MSG.STATE:
        if (this.onStateUpdate) this.onStateUpdate(msg.cars);
        break;
      case MSG.INPUT:
        if (this.onInputReceived) {
          this.onInputReceived({ steer: msg.steer, gas: msg.gas, brake: msg.brake });
        }
        break;
      case MSG.START:
        this._guestId = msg.carIdx;
        if (this.onRaceStart) this.onRaceStart(msg.carIdx);
        break;
      case MSG.FINISH:
        if (this.onRaceFinish) this.onRaceFinish();
        break;
      case MSG.PING:
        this._send({ t: MSG.PONG, ts: msg.ts });
        break;
      case MSG.PONG:
        if (this._pingTime !== null) {
          this.latencyMs = performance.now() - this._pingTime;
        }
        break;
    }
  }

  _send(obj) {
    if (this._dc && this._dc.readyState === 'open') {
      this._dc.send(JSON.stringify(obj));
    }
  }

  _startPing() {
    this._pingInterval = setInterval(() => {
      this._pingTime = performance.now();
      this._send({ t: MSG.PING, ts: this._pingTime });
    }, 2000);
  }

  /** Wait until ICE gathering is complete (all candidates collected). */
  _waitForIce() {
    return new Promise((resolve) => {
      if (this._pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const handler = () => {
        if (this._pc.iceGatheringState === 'complete') {
          this._pc.removeEventListener('icegatheringstatechange', handler);
          resolve();
        }
      };
      this._pc.addEventListener('icegatheringstatechange', handler);
      // Safety timeout – resolve after 8 s even if gathering is incomplete
      setTimeout(resolve, 8000);
    });
  }

  destroy() {
    clearInterval(this._tickTimer);
    clearInterval(this._pingInterval);
    if (this._dc) this._dc.close();
    if (this._pc) this._pc.close();
    this.connected = false;
  }
}
