class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Buffer size 512 frames (~32ms at 16kHz)
        // Reduces WebSocket overhead while keeping latency low
        this.bufferSize = 512; 
        this.buffer = new Int16Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const inputData = input[0];
            
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                this.buffer[this.bufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                
                if (this.bufferIndex >= this.bufferSize) {
                    this.flush();
                }
            }
        }
        return true;
    }

    flush() {
        if (this.bufferIndex > 0) {
            // Send a copy of the valid data
            this.port.postMessage(this.buffer.slice(0, this.bufferIndex));
            this.bufferIndex = 0;
        }
    }
}

registerProcessor('audio-processor', AudioProcessor);