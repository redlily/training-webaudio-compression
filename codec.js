// サウンドエンコーダとデコーダの実装

var wamCodec = wamCodec || {};

(function () {

    // マジックナンバー Web Audio compression Media format 0
    const MAGIC_NUMBER = ("W".charCodeAt(0) << 24) | ("A".charCodeAt(0) << 16) | ("M".charCodeAt(0) << 8) | "0".charCodeAt(0);
    // ファイルタイプ、 Simple Modified discrete cosine transform Data 0
    const FILE_TYPE_SMD0 = ("S".charCodeAt(0) << 24) | ("M".charCodeAt(0) << 16) | ("D".charCodeAt(0) << 8) | "0".charCodeAt(0);
    // SMD0形式のバージョン
    const SMD0_VERSION = 0;

    // ヘッダオフセット、マジックナンバー
    const HEADER_OFFSET_MAGIC_NUMBER = 0;
    // ヘッダオフセット、データサイズ
    const HEADER_OFFSET_DATA_SIZE = 4;
    // ヘッダオフセット、データタイプ、拡張用
    const HEADER_OFFSET_DATA_TYPE = 8;
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
    // ヘッダオフセット、周波数テーブルサイズ、32で割れる数を指定すると効率が良い
    const HEADER_OFFSET_FREQUENCY_TABLE_SIZE = 32;
    // ヘッダオフセット、フレーム数
    const HEADER_OFFSET_FRAME_COUNT = 36;
    // ヘッダオフセット、データ
    const HEADER_OFFSET_DATA = 40;

    // フレームヘッダ、オフセット、振幅スケール
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
    function applyWindowFunction(n, samples, windowFunction) {
        for (let i = 0; i < n; ++i) {
            samples[i] *= windowFunction[i];
        }
    }

    // Web Audio Media エンコーダ
    class WamEncoder {

        constructor(sampleRate, channelSize, frequencyRange, frequencyTableSize) {
            this.sampleRate = sampleRate;
            this.channelSize = channelSize;
            this.frequencyRange = frequencyRange != null ? frequencyRange : 1024;
            this.frequencyTableSize = frequencyTableSize != null ? frequencyTableSize : this.frequencyRange >> 2;

            this.data = new DataView(new ArrayBuffer(4096));
            this.data.setUint32(HEADER_OFFSET_MAGIC_NUMBER, MAGIC_NUMBER);
            this.data.setUint32(HEADER_OFFSET_DATA_SIZE, 0);
            this.data.setUint32(HEADER_OFFSET_DATA_TYPE, FILE_TYPE_SMD0);
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

    wamCodec.WamEncoder = WamEncoder;

    // Web Audio Media デコーダ
    class WamDecoder {

        constructor(data) {
            this.data = new DataView(data);

            this.magicNumber = this.data.getUint32(HEADER_OFFSET_MAGIC_NUMBER);
            this.fileSize = this.data.getUint32(HEADER_OFFSET_DATA_SIZE);
            this.fileType = this.data.getUint32(HEADER_OFFSET_DATA_TYPE);
            this.version = this.data.getUint32(HEADER_OFFSET_VERSION);
            this.sampleRate = this.data.getUint32(HEADER_OFFSET_SAMPLE_RATE);
            this.channelSize = this.data.getUint32(HEADER_OFFSET_CHANNEL_SIZE);
            this.sampleCount = this.data.getUint32(HEADER_OFFSET_SAMPLE_COUNT);
            this.frequencyRange = this.data.getUint32(HEADER_OFFSET_FREQUENCY_RANGE);
            this.frequencyTableSize = this.data.getUint32(HEADER_OFFSET_FREQUENCY_TABLE_SIZE);
            this.frameCount = this.data.getUint32(HEADER_OFFSET_FRAME_COUNT);

            this.windowFunction = createWindowFunction(this.frequencyRange << 1);
            this.frequencyFlags = new Uint32Array(this.frequencyRange / 32);
            this.frequencyBuffer = new Float32Array(this.frequencyRange);
            this.sampleBuffer = new Float32Array(this.frequencyRange << 1);
            this.prevOutputs = new Array(this.channelSize);
            for (let i = 0; i < this.channelSize; ++i) {
                this.prevOutputs[i] = new Float32Array(this.frequencyRange);
            }
            this.currentFrame = 0;
        }

        popFrame(sampleData) {
            for (let i = 0; i < this.channelSize; ++i) {
                let samples = sampleData[i];

                let offset = HEADER_OFFSET_DATA +
                    (FRAME_OFFSET_DATA + (this.frequencyRange / 32) * 4 + this.frequencyTableSize) *
                    (this.channelSize * this.currentFrame + i);

                // 振幅スケールを取得
                let scale = this.data.getUint32(offset + FRAME_OFFSET_SCALE);

                // 周波数フラグを取得
                offset += FRAME_OFFSET_DATA;
                for (let j = 0; j < this.frequencyFlags.length; ++j) {
                    this.frequencyFlags[j] = this.data.getUint32(offset);
                    offset += 4;
                }

                // 周波数テーブルを取得
                this.frequencyBuffer.fill(0);
                for (let j = 0; j < this.frequencyRange; ++j) {
                    if ((this.frequencyFlags[Math.floor(j / 32)] >> j % 32) & 0x1 != 0) {
                        let value = this.data.getInt8(offset);
                        let signed = (value >> 7);
                        let volume = Math.pow(2, -(0x7f & value) / 16) * scale;
                        this.frequencyBuffer[j] = signed == 0 ? volume : -volume;
                        offset += 1;
                    }
                }

                // 逆MDCTをかける
                FastMDCT.imdct(this.frequencyRange, this.sampleBuffer, this.frequencyBuffer);

                // 窓関数をかける
                applyWindowFunction(this.frequencyRange << 1, this.sampleBuffer, this.windowFunction);

                // 前回の後半の計算結果と今回の前半の計算結果をクロスフェードして出力
                let prevOutput = this.prevOutputs[i];
                for (let j = 0; j < this.frequencyRange; ++j) {
                    samples[j] = prevOutput[j] + this.sampleBuffer[j] / ((1 << 15) - 1);
                    prevOutput[j] = this.sampleBuffer[this.frequencyRange + j] / ((1 << 15) - 1);
                }
            }
            this.nextFrame();
        }

        nextFrame() {
            this.currentFrame = (this.currentFrame + 1) % this.frameCount;
        }
    }

    wamCodec.WamDcoder = WamDecoder;

})();