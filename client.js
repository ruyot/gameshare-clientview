class RemoteGameShareClient {
    constructor() {
        this.ws = null;
        this.pc = null;
        this.dataChannel = null;
        this.sessionId = null;
        this.connected = false;
        this.signalingUrl = null;
        
        this.setupEventListeners();
        this.initializeConnection();
    }

    setupEventListeners() {
        // Video element events
        const video = document.getElementById('remoteVideo');
        video.addEventListener('loadedmetadata', () => {
            console.log('Video metadata loaded');
        });

        video.addEventListener('loadeddata', () => {
            console.log('Video data loaded');
        });

        // Input event listeners for game control
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        document.addEventListener('wheel', (e) => this.handleMouseWheel(e), { passive: false });
        
        // Pointer lock events
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === video) {
                console.log('Pointer locked to video');
            } else {
                console.log('Pointer lock released');
            }
        });
    }

    initializeConnection() {
        // Get session ID from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        this.sessionId = urlParams.get('session') || 'default-session';
        
        // Build signaling URL dynamically based on current host
        const proto = location.protocol === "https:" ? "wss" : "ws";
        const host = location.host; // "gameshare-clientview.fly.dev"
        this.signalingUrl = `${proto}://${host}/signaling?session=${this.sessionId}`;
        
        console.log(`Connecting to session: ${this.sessionId} via ${this.signalingUrl}`);
        this.connect();
    }

    async connect() {
        if (!this.signalingUrl || !this.sessionId) {
            console.error('Missing signaling URL or session ID');
            return;
        }

        try {
            // Connect to remote signaling server
            this.ws = new WebSocket(this.signalingUrl);
            this.ws.onopen = () => this.onSignalingConnected();
            this.ws.onmessage = (event) => this.onSignalingMessage(event);
            this.ws.onerror = (error) => this.onSignalingError(error);
            this.ws.onclose = () => this.onSignalingClosed();

        } catch (error) {
            console.error('Connection failed:', error);
        }
    }

    async onSignalingConnected() {
        console.log('Connected to signaling server');
        
        // Join the session as a client
        const joinMessage = {
            type: 'join',
            session_id: this.sessionId,
            client_type: 'client'
        };
        
        this.ws.send(JSON.stringify(joinMessage));
    }

    async onSignalingMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('Received signaling message:', message);

            switch (message.type) {
                case 'joined':
                    console.log(`Successfully joined session as ${message.client_type}`);
                    break;
                case 'offer':
                    await this.handleOffer(message);
                    break;
                case 'ice-candidate':
                    await this.handleIceCandidate(message);
                    break;
                case 'error':
                    console.error('Signaling error:', message.message);
                    break;
                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Failed to parse signaling message:', error);
        }
    }

    onSignalingError(error) {
        console.error('Signaling error:', error);
    }

    onSignalingClosed() {
        console.log('Signaling connection closed');
        this.connected = false;
        
        // Try to reconnect after a short delay
        setTimeout(() => {
            console.log('Attempting to reconnect...');
            this.connect();
        }, 2000);
    }

    async setupPeerConnection() {
        console.log('Setting up peer connection...');
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        this.pc = new RTCPeerConnection(configuration);
        console.log('Peer connection created with config:', configuration);

        // Handle incoming tracks
        this.pc.ontrack = (event) => {
            console.log('🎥 Received remote track:', event.track.kind, event.track.id);
            const video = document.getElementById('remoteVideo');
            
            if (event.streams && event.streams[0]) {
                console.log('Setting video srcObject from stream with', event.streams[0].getTracks().length, 'tracks');
                video.srcObject = event.streams[0];
            } else {
                console.log('Creating new MediaStream for single track');
                const stream = new MediaStream();
                stream.addTrack(event.track);
                video.srcObject = stream;
            }
            
            // Add event listeners for video element
            video.onloadedmetadata = () => {
                console.log('✅ Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight);
                video.play().catch(e => console.error('Video play failed:', e));
            };
            
            video.onerror = (e) => {
                console.error('❌ Video element error:', e);
            };
            
            console.log('🎬 Video srcObject set, attempting to play');
        };

        // Handle ICE candidates
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Generated ICE candidate:', event.candidate);
                const candidateMessage = {
                    type: 'ice-candidate',
                    candidate: event.candidate.candidate,
                    sdp_mid: event.candidate.sdpMid,
                    sdp_mline_index: event.candidate.sdpMLineIndex,
                    session_id: this.sessionId
                };
                this.ws.send(JSON.stringify(candidateMessage));
                console.log('Sent ICE candidate to backend');
            } else {
                console.log('ICE candidate gathering complete');
            }
        };

        // Handle connection state changes
        this.pc.onconnectionstatechange = () => {
            console.log('Connection state changed:', this.pc.connectionState);
            if (this.pc.connectionState === 'connected') {
                this.connected = true;
                console.log('✅ WebRTC connection established successfully');
            } else if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected') {
                console.error('❌ WebRTC connection failed/disconnected:', this.pc.connectionState);
                this.connected = false;
                this.cleanupConnection();
            }
        };

        // Setup data channel for input events
        this.setupDataChannel();
    }

    setupDataChannel() {
        this.dataChannel = this.pc.createDataChannel('input', {
            ordered: true,
            maxRetransmits: 3
        });

        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
        };

        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
        };

        this.dataChannel.onerror = (error) => {
            console.error('Data channel error:', error);
        };
    }

    async handleOffer(message) {
        console.log('📨 Received offer from host');
        console.log('Offer SDP:', message.sdp);
        
        if (!this.pc) {
            await this.setupPeerConnection();
        }

        try {
            console.log('Setting remote description (offer)...');
            await this.pc.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: message.sdp
            }));
            console.log('✅ Remote description set successfully');

            console.log('Creating answer...');
            const answer = await this.pc.createAnswer();
            console.log('Answer SDP:', answer.sdp);
            
            console.log('Setting local description (answer)...');
            await this.pc.setLocalDescription(answer);
            console.log('✅ Local description set successfully');

            const answerMessage = {
                type: 'answer',
                sdp: answer.sdp,
                session_id: this.sessionId
            };

            this.ws.send(JSON.stringify(answerMessage));
            console.log('📤 Sent answer to host');
        } catch (error) {
            console.error('❌ Error handling offer:', error);
            console.error('Error details:', error.message);
            if (error.name === 'InvalidAccessError') {
                console.error('This might be an H264 codec compatibility issue');
            }
        }
    }

    async handleIceCandidate(message) {
        if (!this.pc) {
            console.warn('⚠️ Received ICE candidate before peer connection setup');
            return;
        }

        try {
            console.log('📨 Received ICE candidate from host:', message.candidate);
            const candidate = new RTCIceCandidate({
                candidate: message.candidate,
                sdpMid: message.sdp_mid,
                sdpMLineIndex: message.sdp_mline_index
            });

            await this.pc.addIceCandidate(candidate);
            console.log('✅ ICE candidate added successfully');
        } catch (error) {
            console.error('❌ Error adding ICE candidate:', error);
            console.error('Candidate details:', message);
        }
    }

    sendInputEvent(event) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(event));
        }
    }

    handleKeyDown(e) {
        if (!this.connected) return;
        
        const event = {
            type: 'keydown',
            code: e.code,
            key: e.key,
            timestamp: Date.now()
        };
        this.sendInputEvent(event);
    }

    handleKeyUp(e) {
        if (!this.connected) return;
        
        const event = {
            type: 'keyup',
            code: e.code,
            key: e.key,
            timestamp: Date.now()
        };
        this.sendInputEvent(event);
    }

    handleMouseMove(e) {
        if (!this.connected) return;
        
        const video = document.getElementById('remoteVideo');
        const rect = video.getBoundingClientRect();
        
        const event = {
            type: 'mousemove',
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            timestamp: Date.now()
        };
        this.sendInputEvent(event);
    }

    handleMouseDown(e) {
        if (!this.connected) return;
        
        const event = {
            type: 'mousedown',
            button: e.button,
            timestamp: Date.now()
        };
        this.sendInputEvent(event);
    }

    handleMouseUp(e) {
        if (!this.connected) return;
        
        const event = {
            type: 'mouseup',
            button: e.button,
            timestamp: Date.now()
        };
        this.sendInputEvent(event);
    }

    handleMouseWheel(e) {
        if (!this.connected) return;
        
        e.preventDefault();
        
        const event = {
            type: 'wheel',
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            timestamp: Date.now()
        };
        this.sendInputEvent(event);
    }

    cleanupConnection() {
        console.log('🧹 Cleaning up WebRTC connection...');
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        this.connected = false;
        console.log('✅ Connection cleanup complete');
    }

    // Enhanced error handling for WebSocket
    onSignalingError(error) {
        console.error('❌ Signaling error:', error);
        this.cleanupConnection();
    }

    onSignalingClosed() {
        console.log('🔌 Signaling connection closed');
        this.connected = false;
        
        // Try to reconnect after a short delay
        setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            this.connect();
        }, 2000);
    }
}

// Initialize the client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new RemoteGameShareClient();
}); 