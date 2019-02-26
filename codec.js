// サウンドエンコーダとデコーダの実装

var wamCodec = wamCodec || {};

(function () {

    // マジックナンバー Web Audio compression Media format
    const MAGIC_NUMBER =
        ("W".charCodeAt(0)) | ("A".charCodeAt(0) << 8) | ("M".charCodeAt(0) << 16) | ("0".charCodeAt(0) << 24);
    // ファイルタイプ、 Simple Modified discrete cosine transform Data
    const FILE_TYPE_SMD0 =
        ("S".charCodeAt(0)) | ("M".charCodeAt(0) << 8) | ("D".charCodeAt(0) << 16) | ("0".charCodeAt(0) << 24);
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

    // アサート
    function assert(test, message) {
        if (!test) throw new Error(message || "Failed to test.");
    }

    // 窓関数となる配列を生成、窓の種類はVorbis窓
    function createWindowFunction(num) {
        let windowFunction = new Float32Array(num);
        for (let i = 0; i < num >> 1; ++i) {
            let value = Math.sin(Math.PI / 2 * Math.pow(Math.sin(Math.PI * (i / (num - 1))), 2));
            windowFunction[i] = value;
            windowFunction[num - 1 - i] = value;
        }
        return windowFunction;
    }

    // 窓関数をサンプルに適用する
    function applyWindowFunction(num, samples, windowFunction) {
        for (let i = 0; i < num; ++i) {
            samples[i] *= windowFunction[i];
        }
    }

    // Web Audio Media エンコーダ
    class WamEncoder {

        constructor(sampleRate, channelSize, frequencyRange, frequencyTableSize, initSampleCount = 4096) {
            this.sampleRate = sampleRate;
            this.channelSize = channelSize;
            this.frequencyRange = frequencyRange != null ? frequencyRange : 1024;
            this.frequencyTableSize = frequencyTableSize != null ? frequencyTableSize : this.frequencyRange >> 2;

            assert(sampleRate > 0);
            assert(channelSize > 0);
            assert(frequencyRange > 0);
            assert(frequencyTableSize > 0);

            let initBufferSize = HEADER_OFFSET_DATA +
                (FRAME_OFFSET_DATA + (this.frequencyRange / 32) * 4 + this.frequencyTableSize) *
                this.channelSize * Math.ceil(initSampleCount / this.frequencyRange);

            this.data = new DataView(new ArrayBuffer(initBufferSize));
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

            this.windowFunction = createWindowFunction(this.frequencyRange << 1);
            this.frequencyFlags = new Uint32Array(this.frequencyRange / 32);
            this.frequencies = new Float32Array(this.frequencyRange);
            this.frequencyPowers = new Float32Array(this.frequencyRange);
            this.samples = new Float32Array(this.frequencyRange << 1);
            this.prevInputs = new Array(this.channelSize);
            for (let i = 0; i < this.channelSize; ++i) {
                this.prevInputs[i] = new Float32Array(this.frequencyRange);
            }

            this.frameCount = 0;
        }

        writeFrame(inputData, start = 0, length = this.frequencyRange) {
            assert(length <= this.frequencyRange && length >= 0);

            this.nextFrame();
            for (let i = 0; i < this.channelSize; ++i) {
                let input = inputData[i];

                let dataOffset = HEADER_OFFSET_DATA +
                    (FRAME_OFFSET_DATA + (this.frequencyRange / 32) * 4 + this.frequencyTableSize) *
                    (this.channelSize * (this.frameCount - 1) + i);

                // 前回の入力を処理バッファの前半に充填
                let prevInput = this.prevInputs[i];
                for (let j = 0; j < this.frequencyRange; ++j) {
                    this.samples[j] = prevInput[j];
                }

                // 今回の入力を処理バッファの後半に充填し、次回の処理に備え保存
                for (let j = 0; j < length; ++j) {
                    let value = input[start + this.frequencyRange + j] * ((1 << 16) - 1); // [-1, 1]の数値を16bitの数値にスケール
                    this.samples[this.frequencyRange + j] = value;
                    prevInput[j] = value;
                }
                for (let j = length; j < this.frequencyFlags; ++j) {
                    this.samples[this.frequencyRange + j] = 0;
                    prevInput[j] = 0;
                }

                // 窓関数をかける
                applyWindowFunction(this.frequencyRange << 1, this.samples, this.windowFunction);

                // MDCTをかける
                FastMDCT.mdct(this.frequencyRange, this.samples, this.frequencies);

                // 振幅スケールを書き出し
                let scale = 1;
                for (let j = 0; j < this.frequencyRange; ++j) {
                    let value = Math.abs(this.frequencies[j]);
                    this.frequencyPowers[j] = value / scale >= 1 / (1 << 8) ? value ** 0.5 : 0;
                    if (value > scale) {
                        scale = value;
                    }
                }
                this.data.setUint32(dataOffset + FRAME_OFFSET_SCALE, scale);

                // 振幅スケールを書き出し
                let scales = new Float32Array(Math.log2(this.frequencyRange));
                for (let j = 0; j < scales.length; ++j) {
                    let scale = 1;
                    for (let k = (1 << j) >> 1; k < 1 << j; ++k) {
                        let value = Math.abs(this.frequencies[j]);
                        this.frequencyPowers[j] = value / scale >= 1 / (1 << 8) ? value ** 0.5 : 0;
                        if (value > scale) {
                            scale = value;
                        }
                    }
                    scales[j] = scale
                }

                // 書き出す周波数を選択
                this.frequencyFlags.fill(0);
                let writeCount = 0;
                while (writeCount < this.frequencyTableSize) {
                    let sumPower = 0;
                    for (let j = 0; j < this.frequencyRange; ++j) {
                        sumPower += this.frequencyPowers[j];
                    }
                    if (sumPower <= 0) {
                        break;
                    }

                    let sum = 0;
                    let maxIndex = 0;
                    let maxPower = this.frequencyPowers[this.frequencyRange - 1];
                    for (let j = this.frequencyRange - 1; j >= 0 && writeCount < this.frequencyTableSize; --j) {
                        let power = this.frequencyPowers[j];
                        sum += power;

                        if (power > maxPower) {
                            maxPower = power;
                            maxIndex = j;
                        }

                        if (sum >= sumPower / this.frequencyTableSize) {
                            this.frequencyFlags[Math.floor(maxIndex / 32)] |= 1 << (maxIndex % 32);
                            this.frequencyPowers[maxIndex] = 0;
                            writeCount++;

                            sum = 0;
                            maxIndex = j - 1;
                            maxPower = this.frequencyPowers[j - 1];
                        }
                    }
                }

                // 周波数テーブルを書き出し
                dataOffset += FRAME_OFFSET_DATA;
                for (let j = 0; j < this.frequencyFlags.length; ++j) {
                    this.data.setUint32(dataOffset, this.frequencyFlags[j]);
                    dataOffset += 4;
                }

                // 周波数フラグを書き出し
                let frequencyOffset = 0;
                for (let j = 0; j < this.frequencyRange; ++j) {
                    if ((this.frequencyFlags[Math.floor(j / 32)] >> (j % 32)) & 0x1 != 0) {
                        let offset = dataOffset + (frequencyOffset);
                        let value = this.frequencies[j] / scale;
                        let signed = value >= 0 ? 0x0 : 0x8;
                        let power = 0x7 & Math.ceil(Math.min(-Math.log2(Math.abs(value)), 7));
                        if (0x & frequencyOffset == 0) {
                            this.data.setUint8(offset, signed | power);
                        } else {
                            let low = (0xf & this.data.getUint8(offset));
                            let high = signed | power;
                            this.data.setUint8(offset, high << 4);
                        }
                        frequencyOffset += 1;
                    }
                }

                let str = writeCount + " ";
                for (let j = 0; j < this.frequencyRange; ++j) {
                    str += (this.frequencyFlags[Math.floor(j / 32)] >> (j % 32)) & 0x1;
                }
                console.log(str);
            }
        }

        nextFrame() {
            this.frameCount++;
            if (this.getDataSize() > this.data.buffer.byteLength) {
                let buffer = new ArrayBuffer(this.data.buffer.byteLength << 1);
                new Uint8Array(buffer).set(new Uint8Array(this.data.buffer));
                this.data = new DataView(buffer);
            }
        }

        getDataSize() {
            return HEADER_OFFSET_DATA +
                (FRAME_OFFSET_DATA + (this.frequencyRange / 32) * 4 + this.frequencyTableSize) *
                this.channelSize * this.frameCount;
        }

        getDataBuffer() {
            let dataSize = this.getDataSize();
            this.data.setUint32(HEADER_OFFSET_DATA_SIZE, dataSize);
            this.data.setUint32(HEADER_OFFSET_SAMPLE_COUNT, this.frequencyRange * this.frameCount);
            this.data.setUint32(HEADER_OFFSET_FRAME_COUNT, this.frameCount);
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

            assert(this.magicNumber == MAGIC_NUMBER);
            assert(this.fileSize <= data.byteLength);
            assert(this.fileType == FILE_TYPE_SMD0);
            assert(this.version == 0);
            assert(this.sampleRate > 0);
            assert(this.channelSize > 0);
            assert(this.sampleCount <= this.frequencyRange * this.frameCount);
            assert(this.frequencyRange > 0);
            assert(this.frequencyTableSize > 0);

            this.windowFunction = createWindowFunction(this.frequencyRange << 1);
            this.frequencyFlags = new Uint32Array(this.frequencyRange / 32);
            this.frequencies = new Float32Array(this.frequencyRange);
            this.samples = new Float32Array(this.frequencyRange << 1);
            this.prevOutputs = new Array(this.channelSize);
            for (let i = 0; i < this.channelSize; ++i) {
                this.prevOutputs[i] = new Float32Array(this.frequencyRange);
            }
            this.currentFrame = 0;
        }

        readFrame(outputData, start = 0, length = 0) {
            for (let i = 0; i < this.channelSize; ++i) {
                let output = outputData[i];

                let dataOffset = HEADER_OFFSET_DATA +
                    (FRAME_OFFSET_DATA + (this.frequencyRange / 32) * 4 + this.frequencyTableSize) *
                    (this.channelSize * this.currentFrame + i);

                // 振幅スケールを取得
                let scale = this.data.getUint32(dataOffset + FRAME_OFFSET_SCALE);

                // 周波数フラグを取得
                dataOffset += FRAME_OFFSET_DATA;
                for (let j = 0; j < this.frequencyFlags.length; ++j) {
                    this.frequencyFlags[j] = this.data.getUint32(dataOffset);
                    dataOffset += 4;
                }

                // 周波数テーブルを取得
                this.frequencies.fill(0);
                let frequencyOffset = 0;
                for (let j = 0; j < this.frequencyRange; ++j) {
                    if ((this.frequencyFlags[Math.floor(j / 32)] >> j % 32) & 0x1 != 0) {
                        let offset = dataOffset + (frequencyOffset);
                        let value = (0x & frequencyOffset == 0 ? 0xf & this.data.getUint8(offset) : 0xf & (this.data.getUint8(offset) >> 4));
                        let signed = 0x8 & value;
                        let power = Math.pow(2, -(0x7 & value)) * scale;
                        this.frequencies[j] = signed == 0 ? power : -power;
                        frequencyOffset += 1;
                    }
                }

                // 逆MDCTをかける
                FastMDCT.imdct(this.frequencyRange, this.samples, this.frequencies);

                // 窓関数をかける
                applyWindowFunction(this.frequencyRange << 1, this.samples, this.windowFunction);

                // 前回の後半の計算結果と今回の前半の計算結果をクロスフェードして出力
                let prevOutput = this.prevOutputs[i];
                for (let j = 0; j < this.frequencyRange; ++j) {
                    output[start + j] = prevOutput[j] + this.samples[j] / ((1 << 16) - 1); // 16bitの数値を[-1, 1]の数値にスケール
                    prevOutput[j] = this.samples[this.frequencyRange + j] / ((1 << 16) - 1);
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