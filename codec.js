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
    const HEADER_OFFSET_SAMPLING_RATE = 16;
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

    // フレームヘッダ、オフセット、振幅のメインスケール
    const FRAME_OFFSET_MASTER_SCALE = 0;
    // フーレムヘッダ、オフセット、振幅のサブスケール、4bitで8つのメインスケールからのスケール値を対数で保持する
    const FRAME_OFFSET_SUB_SCALE = 4;
    // フレームヘッダ、オフセット、データ
    const FRAME_OFFSET_DATA = 8;

    // 対数による量子化で使用する対数の底
    const BASE_OF_LOGARITHM = 2;

    // アサート
    function assert(test, message) {
        if (!test) throw new Error(message || "Failed to test.");
    }

    // Web Audio Media コーダ
    class WamCoder {

        constructor() {
            this.data = null;
            this.channelSize = 0;
            this.frequencyRange = 0;
            this.frequencyTableSize = 0;
            this.subScales = null;
            this.windowFunction = null;
            this.samples = null;
        }

        readHalfUbyte(offset, index) {
            return 0xf & (this.data.getUint8(offset) >>> (index << 2));
        }

        writeHalfUbyte(offset, index, value) {
            this.data.setUint8(
                offset,
                (0xff & (this.data.getUint8(offset) & ~(0xf << (index << 2)))) | ((0xf & value) << (index << 2)));
        }

        // 窓関数となる配列を生成、窓の種類はVorbis窓
        setupWindowFunction() {
            this.windowFunction = new Float32Array(this.frequencyRange << 1);
            for (let i = 0; i < this.frequencyRange; ++i) {
                let value = Math.sin(Math.PI / 2 * Math.pow(Math.sin(Math.PI * (i / ((this.frequencyRange << 1) - 1))), 2));
                this.windowFunction[i] = value;
                this.windowFunction[(this.frequencyRange << 1) - 1 - i] = value;
            }
        }

        // 窓関数をサンプルに適用する
        applyWindowFunction() {
            for (let i = 0; i < this.frequencyRange << 1; ++i) {
                this.samples[i] *= this.windowFunction[i];
            }
        }

        getDataOffset(frame, channel) {
            return HEADER_OFFSET_DATA +
                (FRAME_OFFSET_DATA +
                    this.frequencyRange / 8 +
                    (this.frequencyTableSize >>> 1)) *
                (this.channelSize * frame + channel);
        }
    }

    // Web Audio Media エンコーダ
    class WamEncoder extends WamCoder {

        constructor(samplingRate, channelSize, frequencyRange, frequencyTableSize, initSampleCount = 4096) {
            super();

            this.samplingRate = samplingRate;
            this.channelSize = channelSize;
            this.frequencyRange = frequencyRange != null ? frequencyRange : 1024;
            this.frequencyTableSize = frequencyTableSize != null ? frequencyTableSize : this.frequencyRange >>> 2;

            assert(samplingRate > 0);
            assert(channelSize > 0);
            assert(frequencyRange > 0);
            assert(frequencyRange % 32 == 0); // 効率を重視して32の倍数である必要がある
            assert(frequencyTableSize > 0);
            assert(frequencyTableSize % 4 == 0); // バイト境界を考慮して8の倍数である必要がある

            let initBufferSize = HEADER_OFFSET_DATA +
                (FRAME_OFFSET_DATA + (this.frequencyRange / 32) * 4 + this.frequencyTableSize) *
                this.channelSize * Math.ceil(initSampleCount / this.frequencyRange);

            this.data = new DataView(new ArrayBuffer(initBufferSize));
            this.data.setUint32(HEADER_OFFSET_MAGIC_NUMBER, MAGIC_NUMBER);
            this.data.setUint32(HEADER_OFFSET_DATA_SIZE, 0);
            this.data.setUint32(HEADER_OFFSET_DATA_TYPE, FILE_TYPE_SMD0);
            this.data.setUint32(HEADER_OFFSET_VERSION, SMD0_VERSION);
            this.data.setUint32(HEADER_OFFSET_SAMPLING_RATE, this.samplingRate);
            this.data.setUint32(HEADER_OFFSET_CHANNEL_SIZE, this.channelSize);
            this.data.setUint32(HEADER_OFFSET_SAMPLE_COUNT, 0);
            this.data.setUint32(HEADER_OFFSET_FREQUENCY_RANGE, this.frequencyRange);
            this.data.setUint32(HEADER_OFFSET_FREQUENCY_TABLE_SIZE, this.frequencyTableSize);
            this.data.setUint32(HEADER_OFFSET_FRAME_COUNT, 0);

            this.setupWindowFunction();

            this.subScales = new Uint8Array(Math.min(Math.round(Math.log2(this.frequencyRange)), 8));
            this.subScaleStart = 1 << Math.max(Math.round(Math.log2(this.frequencyRange)) - 8, 1);
            this.frequencyFlags = new Uint32Array(this.frequencyRange / 32);
            this.frequencies = new Float32Array(this.frequencyRange);
            this.frequencyPowers = new Float32Array(this.frequencyRange);
            this.samples = new Float32Array(this.frequencyRange << 1);
            this.prevInputs = new Array(this.channelSize);
            for (let i = 0; i < this.channelSize; ++i) {
                this.prevInputs[i] = new Float32Array(this.frequencyRange);
            }
            this.frameCount = 0;
            this.workBuffer = new Array(this.channelSize);
            for (let i = 0; i < this.channelSize; ++i) {
                this.workBuffer = new Float32Array(this.frequencyRange);
            }
        }

        write(inputData, start = 0, length = this.frequencyRange) {
            for (let i = 0; i < length; i += this.frequencyRange) {
                // TODO: frequency rangeの倍数でなく中途半端なサンプル数を書き込めるような処理を実装
            }
        }

        writeFrame(inputData, start = 0, length = this.frequencyRange) {
            assert(length <= this.frequencyRange && length >= 0);

            this.nextFrame();
            for (let i = 0; i < this.channelSize; ++i) {
                let input = inputData[i];
                let dataOffset = this.getDataOffset(this.frameCount - 1, i);

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
                this.applyWindowFunction();

                // MDCTをかける
                FastMDCT.mdct(this.frequencyRange, this.samples, this.frequencies);

                // 振幅のマスタスケールを書き出し
                let masterScale = 1;
                for (let j = 0; j < this.frequencyRange; ++j) {
                    let power = Math.abs(this.frequencies[j]);
                    if (power > masterScale) {
                        masterScale = power;
                    }
                }
                this.data.setUint32(dataOffset + FRAME_OFFSET_MASTER_SCALE, masterScale);

                // 振幅のサブスケールを書き出す
                for (let j = 0; j < this.subScales.length; ++j) {
                    let subScale = 1;
                    for (let k = this.subScaleStart << (j - 1); k < this.subScaleStart << j && k < this.frequencyRange; ++k) {
                        let power = Math.abs(this.frequencies[k]);
                        if (power > subScale) {
                            subScale = power;
                        }
                    }
                    let power = Math.floor(Math.min(-Math.log(subScale / masterScale) / Math.log(BASE_OF_LOGARITHM) * 2, 15));
                    this.subScales[j] = power;
                    this.writeHalfUbyte(dataOffset + FRAME_OFFSET_SUB_SCALE + (j >>> 1), 0x1 & j, power);
                }

                // 各周波数のパワーを計算しておく
                for (let j = 0; j < this.subScales.length; ++j) {
                    let subScale = this.subScales[j];
                    for (let k = this.subScaleStart << (j - 1); k < this.subScaleStart << j && k < this.frequencyRange; ++k) {
                        let power = Math.abs(this.frequencies[k]) / masterScale;
                        this.frequencyPowers[k] = power > Math.pow(BASE_OF_LOGARITHM, -7 - subScale * 0.5) ? power : 0;
                    }
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
                    let maxIndex = this.frequencyRange - 1;
                    let maxPower = this.frequencyPowers[maxIndex];
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
                            maxPower = this.frequencyPowers[maxIndex];
                        }
                    }
                }

                // 周波数フラグを書き出し
                dataOffset += FRAME_OFFSET_DATA;
                for (let j = 0; j < this.frequencyFlags.length; ++j) {
                    this.data.setUint32(dataOffset, this.frequencyFlags[j]);
                    dataOffset += 4;
                }

                // MDCT用の周波数配列から必要な分を周波数テーブルへ書き出し
                let frequencyOffset = 0;
                for (let j = 0; j < this.subScales.length; ++j) {
                    let subScale = this.subScales[j];
                    for (let k = this.subScaleStart << (j - 1); k < this.subScaleStart << j && k < this.frequencyRange; ++k) {
                        if ((this.frequencyFlags[Math.floor(k / 32)] >>> (k % 32)) & 0x1 != 0) {
                            let value = this.frequencies[k] / (masterScale * Math.pow(BASE_OF_LOGARITHM, -subScale * 0.5));
                            let signed = value >= 0 ? 0x0 : 0x8;
                            let power = Math.ceil(Math.min(-Math.log(Math.abs(value)) / Math.log(BASE_OF_LOGARITHM), 7));
                            this.writeHalfUbyte(
                                dataOffset + (frequencyOffset >>> 1),
                                0x1 & frequencyOffset,
                                signed | power);
                            frequencyOffset += 1;
                        }
                    }
                }
            }
            this.sampleCount += length;
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
            return this.getDataOffset(this.frameCount, 0);
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
    class WamDecoder extends WamCoder {

        static isWamData(data) {
            return new DataView(data).getUint32(HEADER_OFFSET_MAGIC_NUMBER) == MAGIC_NUMBER;
        }

        constructor(data) {
            super();

            this.data = new DataView(data);
            this.magicNumber = this.data.getUint32(HEADER_OFFSET_MAGIC_NUMBER);
            this.fileSize = this.data.getUint32(HEADER_OFFSET_DATA_SIZE);
            this.fileType = this.data.getUint32(HEADER_OFFSET_DATA_TYPE);
            this.version = this.data.getUint32(HEADER_OFFSET_VERSION);
            this.samplingRate = this.data.getUint32(HEADER_OFFSET_SAMPLING_RATE);
            this.channelSize = this.data.getUint32(HEADER_OFFSET_CHANNEL_SIZE);
            this.sampleCount = this.data.getUint32(HEADER_OFFSET_SAMPLE_COUNT);
            this.frequencyRange = this.data.getUint32(HEADER_OFFSET_FREQUENCY_RANGE);
            this.frequencyTableSize = this.data.getUint32(HEADER_OFFSET_FREQUENCY_TABLE_SIZE);
            this.frameCount = this.data.getUint32(HEADER_OFFSET_FRAME_COUNT);

            assert(this.magicNumber == MAGIC_NUMBER);
            assert(this.fileSize <= data.byteLength);
            assert(this.fileType == FILE_TYPE_SMD0);
            assert(this.version == 0);
            assert(this.samplingRate > 0);
            assert(this.channelSize > 0);
            assert(this.sampleCount <= this.frequencyRange * this.frameCount);
            assert(this.frequencyRange > 0);
            assert(this.frequencyTableSize > 0);

            this.setupWindowFunction();

            this.subScales = new Uint8Array(Math.min(Math.round(Math.log2(this.frequencyRange)), 8));
            this.subScaleStart = 1 << Math.max(Math.round(Math.log2(this.frequencyRange)) - 8, 0);
            this.frequencyFlags = new Uint32Array(this.frequencyRange / 32);
            this.frequencies = new Float32Array(this.frequencyRange);
            this.samples = new Float32Array(this.frequencyRange << 1);
            this.prevOutputs = new Array(this.channelSize);
            for (let i = 0; i < this.channelSize; ++i) {
                this.prevOutputs[i] = new Float32Array(this.frequencyRange);
            }
            this.currentFrame = 0;
            this.workBuffers = new Array(this.channelSize);
            for (let i = 0; i < this.channelSize; ++i) {
                this.workBuffers[i] = new Float32Array(this.frequencyRange);
            }
            this.workBufferOffset = this.frequencyRange;
        }

        read(outputData, start = 0, length = this.frequencyRange) {
            // 書き込み出来ていないサンプルを出力バッファ書き込む
            if (this.workBufferOffset < this.frequencyRange) {
                let writeSize = Math.min(length, this.frequencyRange - this.workBufferOffset);
                for (let i = 0; i < this.channelSize; ++i) {
                    let output = outputData[i];
                    let workBuffer = this.workBuffers[i];
                    for (let j = 0; j < writeSize; ++j) {
                        output[start + j] = workBuffer[this.workBufferOffset + j];
                    }
                }
                start += writeSize;
                length -= writeSize;
                this.workBufferOffset += writeSize;
            }

            // 出力バッファにフレーム単位で読み込む
            while (length >= this.frequencyRange) {
                this.readFrame(outputData, start);
                start += this.frequencyRange;
                length -= this.frequencyRange;
            }

            // まだ出力バッファに書き込みきれていない場合
            if (length > 0) {
                this.readFrame(this.workBuffers, 0);
                for (let i = 0; i < this.channelSize; ++i) {
                    let output = outputData[i];
                    let workBuffer = this.workBuffers[i];
                    for (let j = 0; j < length; ++j) {
                        output[start + j] = workBuffer[j];
                    }
                }
                this.workBufferOffset = length;
            }
        }

        readFrame(outputData, start = 0, length = this.frequencyRange) {
            assert(length <= this.frequencyRange && length >= 0);

            for (let i = 0; i < this.channelSize; ++i) {
                let output = outputData[i];
                let dataOffset = this.getDataOffset(this.currentFrame, i);

                // 振幅のマスタボリュームを取得
                let masterVolume = this.data.getUint32(dataOffset + FRAME_OFFSET_MASTER_SCALE);

                // 振幅のサブスケールを取得
                for (let j = 0; j < this.subScales.length; ++j) {
                    this.subScales[j] = this.readHalfUbyte(dataOffset + FRAME_OFFSET_SUB_SCALE + (j >>> 1), 0x1 & j);
                }

                // 周波数フラグを取得
                dataOffset += FRAME_OFFSET_DATA;
                for (let j = 0; j < this.frequencyFlags.length; ++j) {
                    this.frequencyFlags[j] = this.data.getUint32(dataOffset);
                    dataOffset += 4;
                }

                // 周波数テーブルを取得、MDCT用の周波数配列に書き込み
                this.frequencies.fill(0);
                let frequencyOffset = 0;
                for (let j = 0; j < this.subScales.length; ++j) {
                    let subScale = this.subScales[j];
                    for (let k = this.subScaleStart << (j - 1); k < this.subScaleStart << j && k < this.frequencyRange; ++k) {
                        if ((this.frequencyFlags[Math.floor(k / 32)] >>> k % 32) & 0x1 != 0) {
                            let value = this.readHalfUbyte(dataOffset + (frequencyOffset >>> 1), 0x1 & frequencyOffset);
                            let signed = 0x8 & value;
                            let power = Math.pow(BASE_OF_LOGARITHM, -(0x7 & value) - subScale * 0.5) * masterVolume;
                            this.frequencies[k] = signed == 0 ? power : -power;
                            frequencyOffset += 1;
                        }
                    }
                }

                // 逆MDCTをかける
                FastMDCT.imdct(this.frequencyRange, this.samples, this.frequencies);

                // 窓関数をかける
                this.applyWindowFunction();

                // 前回の後半の計算結果と今回の前半の計算結果をクロスフェードして出力
                let prevOutput = this.prevOutputs[i];
                for (let j = 0; j < length; ++j) {
                    output[start + j] = prevOutput[j] + this.samples[j] / ((1 << 16) - 1); // 16bitの数値を[-1, 1]の数値にスケール
                    prevOutput[j] = this.samples[this.frequencyRange + j] / ((1 << 16) - 1);
                }
                for (let j = length; j < this.frequencyRange; ++j) {
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
