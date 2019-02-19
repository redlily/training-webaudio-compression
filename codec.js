(function () {

    // マジックナンバー Web Audio Compression format 0
    const MAGIC_NUMBER = ("W".charCodeAt(0) << 24) | ("A".charCodeAt(0) << 16) | ("M".charCodeAt(0) << 8) | "0".charCodeAt(0);
    // ファイルタイプ、 Simple Modified discrete cosine transform Data 0
    const FILE_TYPE_SMD0 = ("S".charCodeAt(0) << 24) | ("M".charCodeAt(0) << 16) | ("D".charCodeAt(0) << 8) | "0".charCodeAt(0);
    // バージョン
    const SMD0_VERSION = 0;

    // ヘッダオフセット、マジックナンバー
    const HEADER_OFFSET_MAGIC_NUMBER = 0;
    // ヘッダオフセット、ファイルサイズ
    const HEADER_OFFSET_DATA_SIZE = 4;
    // ヘッダオフセット、ファイルタイプ、拡張用
    const HEADER_OFFSET_FILE_TYPE = 8;
    // ヘッダオフセット、バージョン
    const HEADER_OFFSET_VERSION = 12;
    // ヘッダオフセット、サンプリングレート
    const HEADER_OFFSET_SAMPLE_RATE = 16;
    // ヘッダオフセット、チャネル数、1がモノラル、2がステレオ
    const HEADER_OFFSET_CHANNEL_SIZE = 20;
    // ヘッダオフセット、サンプル数
    const HEADER_OFFSET_SAMPLE_COUNT = 24;
    // ヘッダオフセット、周波数レンジ、2のべき乗の値を設定する必要がある
    const HEADER_OFFSET_FREQUENCY_RANGE = 28;
    // ヘッダオフセット、周波数テーブルサイズ、8で割れる数を指定する必要がある
    const HEADER_OFFSET_FREQUENCY_TABLE_SIZE = 32;
    // ヘッダオフセット、フレーム数
    const HEADER_OFFSET_FRAME_COUNT = 36;
    // ヘッダオフセット、データ
    const HEADER_OFFSET_DATA = 40;

    // フレームヘッダ、オフセット、波長スケール
    const FRAME_OFFSET_SCALE = 0;
    // フレームヘッダ、オフセット、データ
    const FRAME_OFFSET_DATA = 4;

    // 窓関数となる配列を生成、窓の種類はVorbis窓
    function createWindowFunction(n) {
        let windowFunction = new Float32Array(n);
        for (let i = 0; i < n >> 1; ++i) {
            let value = Math.sin(Math.PI / 2 * Math.pow(Math.sin(Math.PI * (i / (n - 1))), 2));
            windowFunction[i] = value;
            windowFunction[n - 1 - i] = value;
        }
        return windowFunction;
    }

    // 窓関数をサンプルに適用する
    function applyWindowFunction(n, samples, window) {
        for (let i = 0; i < n; ++i) {
            this.sampleBuffer[i] *= this.windowFunction[i];
        }
    }

    // Web Audio Media エンコーダ
    class WammEncoder {

        constructor(sampleRate, channelSize, frequencyRange, frequencyTableSize) {
            this.sampleRate = sampleRate;
            this.channelSize = channelSize;
            this.frequencyRange = frequencyRange != null ? frequencyRange : 1024;
            this.frequencyTableSize = frequencyTableSize != null ? frequencyTableSize : this.frequencyRange >> 2;

            this.data = new DataView(new ArrayBuffer(4096));
            this.data.setUint32(HEADER_OFFSET_MAGIC_NUMBER, MAGIC_NUMBER);
            this.data.setUint32(HEADER_OFFSET_DATA_SIZE, 0);
            this.data.setUint32(HEADER_OFFSET_FILE_TYPE, FILE_TYPE_SMD0);
            this.data.setUint32(HEADER_OFFSET_VERSION, SMD0_VERSION);
            this.data.setUint32(HEADER_OFFSET_SAMPLE_RATE, this.sampleRate);
            this.data.setUint32(HEADER_OFFSET_CHANNEL_SIZE, this.channelSize);
            this.data.setUint32(HEADER_OFFSET_SAMPLE_COUNT, 0);
            this.data.setUint32(HEADER_OFFSET_FREQUENCY_RANGE, this.frequencyRange);
            this.data.setUint32(HEADER_OFFSET_FREQUENCY_TABLE_SIZE, this.frequencyTableSize);
            this.data.setUint32(HEADER_OFFSET_FRAME_COUNT, 0);

            this.frameCount = this.data.getUint32(HEADER_OFFSET_FRAME_COUNT);
            this.windowFunction = createWindowFunction(this.frequencyRange);
            this.prevInputs = new Array(this.channelSize);
            for (let i = 0; i < this.channelSize; ++i) {
                this.prevInputs[i] = new Float32Array(this.frequencyRange);
            }

            this.currentFrame = 0;
        }

        pushFrame(sampleData) {
            for (let i = 0; i < this.channelSize; ++i) {
                let samples = sampleData[i];
            }
            this.nextFrame();
        }

        nextFrame() {
            this.currentFrame++;
            if (this.getDataSize() > 0) {
                let data = new Uint8Array(new ArrayBuffer(this.data.buffer.byteLength << 1));
                data.set(new Uint8Array(this.data.buffer));
                this.data.buffer = data;
            }
        }

        getDataSize() {
            return HEADER_OFFSET_DATA +
                (FRAME_OFFSET_DATA +
                    (this.frequencyRange / 8) *
                    this.frequencyRange *
                    this.frequencyTableSize *
                    this.channelSize) *
                this.currentFrame;
        }

        getData() {
            this.pushFrame(null);
            let dataSize = this.getDataSize();
            this.data.setUint32(HEADER_OFFSET_DATA_SIZE, dataSize);
            this.data.setUint32(HEADER_OFFSET_SAMPLE_COUNT, this.frequencyRange * this.currentFrame);
            this.data.setUint32(HEADER_OFFSET_FRAME_COUNT, this.currentFrame);
            return this.data.buffer.slice(0, this.getDataSize());
        }
    }

    // Web Audio Media デコーダ
    class WammDecoder {

        constructor(data) {
            this.data = new DataView(data);

            this.magicNumber = this.data.getUint32(HEADER_OFFSET_MAGIC_NUMBER);
            this.fileSize = this.data.getUint32(HEADER_OFFSET_DATA_SIZE);
            this.fileType = this.data.getUint32(HEADER_OFFSET_FILE_TYPE);
            this.version = this.data.getUint32(HEADER_OFFSET_VERSION);
            this.sampleRate = this.data.getUint32(HEADER_OFFSET_SAMPLE_RATE);
            this.channelSize = this.data.getUint32(HEADER_OFFSET_CHANNEL_SIZE);
            this.sampleCount = this.data.getUint32(HEADER_OFFSET_SAMPLE_COUNT);
            this.frequencyRange = this.data.getUint32(HEADER_OFFSET_FREQUENCY_RANGE);
            this.frequencyTableSize = this.data.getUint32(HEADER_OFFSET_FREQUENCY_TABLE_SIZE);
            this.frameCount = this.data.getUint32(HEADER_OFFSET_FRAME_COUNT);

            this.windowFunction = createWindowFunction(this.frequencyRange);
            this.prevOutputs = new Array(this.channelSize);
            for (let i = 0; i < this.channelSize; ++i) {
                this.prevOutputs[i] = new Float32Array(this.frequencyRange);
            }
            this.currentFrame = 0;
        }

        popFrame(sampleData) {
            for (let i = 0; i < this.channelSize; ++i) {
                let samples = sampleData[i];
            }
            this.nextFrame();
        }

        nextFrame() {
            this.currentFrame = (this.currentFrame + 1) % this.frameCount;
        }
    }

})();