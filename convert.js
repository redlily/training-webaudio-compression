(function () {

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

    // 圧縮音声用のデコーダ
    class WamDecoder {

        constructor(buffer) {
            this.data = new DataView(buffer.buffer);

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

            this.prevOutputs = [new Float32Array(1024), new Float32Array(1024)];
            this.currentFrame = 0;
            this.samples = new Float32Array(2048);
            this.frequencyFlags = new Uint32Array(1024 / 32);
            this.frequencyBuffer = new Float32Array(1024);
            this.windowFunction = new Float32Array(2048);
            for (let i = 0; i < 1024; ++i) {
                let value = Math.sin(Math.PI / 2 * Math.pow(Math.sin(Math.PI * (i / (2048 - 1))), 2));
                this.windowFunction[i] = value;
                this.windowFunction[2048 - 1 - i] = value;
            }
        }

        decode(channel, output) {
            let offset = HEADER_OFFSET_DATA + (4 + (1024 / 32) * 4 + 256) * this.channelSize * this.currentFrame;
            offset += (4 + (1024 / 32) * 4 + 256) * channel;

            let scale = this.data.getUint32(offset);
            offset += 4;

            // read flags
            for (let i = 0; i < this.frequencyFlags.length; ++i) {
                this.frequencyFlags[i] = this.data.getUint32(offset);
                offset += 4;
            }

            // read values
            this.frequencyBuffer.fill(0);
            let off = offset;
            for (let i = 0; i < 1024; ++i) {
                if ((this.frequencyFlags[Math.floor(i / 32)] >> i % 32) & 0x1 != 0) {
                    let value = this.data.getInt8(off);
                    let signed = value >> 7;
                    let power = Math.pow(2, -(0x7f & value) / 16) * scale;
                    this.frequencyBuffer[i] = (signed == 0 ? power : -power);
                    off += 1;
                }
            }
            offset += 256;

            FastMDCT.imdct(1024, this.samples, this.frequencyBuffer);

            for (let i = 0; i < 2048; ++i) {
                this.samples[i] *= this.windowFunction[i];
            }

            let prevOutput = this.prevOutputs[channel];
            for (let i = 0; i < 1024; ++i) {
                output[i] = prevOutput[i] + this.samples[i] / ((1 << 15) - 1);
                prevOutput[i] = this.samples[1024 + i] / ((1 << 15) - 1);
            }
        }

        nextFrame() {
            this.currentFrame = (this.currentFrame + 1) % this.frameCount;
        }
    }

    onload = function () {

        let audioContext = null;
        let audioSource = null;
        let audioProcessor = null;

        let fileSelector = document.getElementById("fileSelector");
        let playButton = document.getElementById("playButton");

        playButton.addEventListener("click", function (event) {
            if (audioContext == null) {
                audioContext = new AudioContext();
            }

            if (audioProcessor == null) {
                return;
            }

            if (audioSource == null) {
                audioSource = audioContext.createBufferSource();
                audioSource.connect(audioProcessor);
                audioProcessor.connect(audioContext.destination);
                audioSource.start();
            } else {
                audioSource.stop();
                audioProcessor.disconnect(audioContext.destination);
                audioSource.disconnect(audioProcessor);
                audioSource = null;
            }
        });

        fileSelector.addEventListener("change", function (event) {
            // 入力ファイルの読み込み
            let file = event.target.files[0];
            let reader = new FileReader();

            reader.readAsArrayBuffer(file);
            reader.onloadend = () => {
                if (audioContext == null) {
                    audioContext = new AudioContext();
                }
                audioContext.decodeAudioData(reader.result).then((audioBuf) => {
                    let sampleRate = audioBuf.sampleRate;
                    let channelSize = audioBuf.numberOfChannels;
                    let sampleCount = audioBuf.length;

                    let binary = new Uint8Array(sampleCount * channelSize * 8);
                    let view = new DataView(binary.buffer);

                    // magic number
                    view.setUint8(HEADER_OFFSET_MAGIC_NUMBER + 0, "W".charCodeAt(0));
                    view.setUint8(HEADER_OFFSET_MAGIC_NUMBER + 1, "A".charCodeAt(0));
                    view.setUint8(HEADER_OFFSET_MAGIC_NUMBER + 2, "M".charCodeAt(0));
                    view.setUint8(HEADER_OFFSET_MAGIC_NUMBER + 3, "0".charCodeAt(0));

                    // file type
                    view.getUint8(HEADER_OFFSET_FILE_TYPE + 0, "S".charCodeAt(0));
                    view.getUint8(HEADER_OFFSET_FILE_TYPE + 1, "M".charCodeAt(1));
                    view.getUint8(HEADER_OFFSET_FILE_TYPE + 2, "D".charCodeAt(2));
                    view.getUint8(HEADER_OFFSET_FILE_TYPE + 3, "0".charCodeAt(2));

                    // version
                    view.setUint32(HEADER_OFFSET_VERSION, 0);

                    // sample rate
                    view.setUint32(HEADER_OFFSET_SAMPLE_RATE, sampleRate);

                    // channel size
                    view.setUint32(HEADER_OFFSET_CHANNEL_SIZE, channelSize);

                    // sample count
                    view.setUint32(HEADER_OFFSET_SAMPLE_COUNT, sampleCount);

                    // frequency range
                    view.setUint32(HEADER_OFFSET_FREQUENCY_RANGE, 1024);

                    // frame size
                    view.setUint32(HEADER_OFFSET_FREQUENCY_TABLE_SIZE, 256);

                    // frames
                    let offset = HEADER_OFFSET_DATA;
                    let inputSamples = new Float32Array(2048);
                    let inputFrequencies = new Float32Array(1024);
                    let inputPowers = new Float32Array(1024);
                    let prevInputSamples = [new Float32Array(1024), new Float32Array(1024)];
                    let outputFlags = new Uint32Array(1024 / 32);

                    let windowFunction = new Float32Array(2048);
                    for (let i = 0; i < 1024; ++i) {
                        let value = Math.sin(Math.PI / 2 * Math.pow(Math.sin(Math.PI * (i / (2048 - 1))), 2));
                        windowFunction[i] = value;
                        windowFunction[2048 - 1 - i] = value;
                    }

                    let frameCount = 0;
                    for (let j = 0; j < sampleCount; j += 1024) {
                        frameCount++;

                        for (let i = 0; i < channelSize; ++i) {
                            let channel = audioBuf.getChannelData(i);
                            let prevInput = prevInputSamples[i];

                            for (let k = 0; k < 1024; ++k) {
                                inputSamples[k] = prevInput[k];
                            }

                            for (let k = 0; k < 1024 && j + k < sampleCount; ++k) {
                                let value = channel[j + k] * ((1 << 15) - 1);
                                prevInput[k] = value;
                                inputSamples[1024 + k] = value;
                            }

                            for (let k = 0; k < 2048; ++k) {
                                inputSamples[k] *= windowFunction[k];
                            }

                            FastMDCT.mdct(1024, inputSamples, inputFrequencies);

                            // normalize
                            let scale = 1;
                            for (let k = 0; k < 1024; ++k) {
                                let value = Math.abs(inputFrequencies[k]);
                                if (value > scale) {
                                    scale = value;
                                }
                            }
                            view.setUint32(offset, scale);
                            offset += 4;

                            // power
                            for (let k = 0; k < 1024; ++k) {
                                inputPowers[k] = Math.abs(inputFrequencies[k]);
                            }

                            outputFlags.fill(0);
                            let writeCount = 0;
                            while (writeCount < 256) {
                                let sumPower = 0;
                                for (let k = 0; k < 1024; ++k) {
                                    sumPower += inputPowers[k];
                                }
                                if (sumPower <= 0) {
                                    break;
                                }

                                let sum = 0;
                                let maxIndex = 0;
                                let maxPower = 0;
                                for (let k = 0; k < 1024 && writeCount < 256;) {
                                    let power = inputPowers[k];
                                    sum += power;

                                    if (sum > sumPower / 256) {
                                        inputPowers[maxIndex] = 0;
                                        outputFlags[Math.floor(maxIndex / 32)] |= 1 << (maxIndex % 32);
                                        writeCount++;

                                        sum = 0;
                                        maxIndex = k;
                                        maxPower = power;
                                        continue;
                                    }

                                    if (maxPower < power) {
                                        maxIndex = k;
                                        maxPower = power;
                                    }

                                    ++k;
                                }
                            }

                            // write output flags
                            for (let k = 0; k < outputFlags.length; ++k) {
                                view.setUint32(offset, outputFlags[k]);
                                offset += 4;
                            }

                            // write frequencyBuffer
                            let valueOffset = offset;
                            for (let k = 0; k < 1024; ++k) {
                                if ((outputFlags[Math.floor(k / 32)] >> (k % 32)) & 0x1 != 0) {
                                    let value = inputFrequencies[k] / scale;
                                    view.setInt8(
                                        valueOffset,
                                        (value >= 0 ? 0x00 : 0x80) |
                                        (0x7f & Math.floor(Math.min(16 * -Math.log2(Math.abs(value)), 127))));
                                    valueOffset += 1;
                                }
                            }
                            offset += 256;

                            let str = "" + offset + " " + valueOffset + " " + scale + " ";
                            for (let k = 0; k < 1024; ++k) {
                                str += (outputFlags[Math.floor(k / 32)] >> (k % 32)) & 0x1;
                            }
                            console.log(str);
                        }
                    }

                    view.setUint32(HEADER_OFFSET_DATA_SIZE, offset);
                    view.setUint32(HEADER_OFFSET_FRAME_COUNT, frameCount);

                    let dec = new wamCodec.WamDcoder(new Uint8Array(binary, 0, offset).buffer);
                    let decoder = new WamDecoder(new Uint8Array(binary, 0, offset));
                    audioProcessor = audioContext.createScriptProcessor(1024, 2, 2);
                    audioProcessor.onaudioprocess = (event) => {
                        let sampleData = new Array(event.outputBuffer.numberOfChannels);
                        for (let i = 0; i < sampleData.length; ++i) {
                            sampleData[i] = event.outputBuffer.getChannelData(i);
                        }
                        dec.popFrame(sampleData);

                        // let outputBuffer = event.outputBuffer;
                        // for (let i = 0; i < 2; ++i) {
                        //     decoder.decode(i, outputBuffer.getChannelData(i));
                        // }
                        // decoder.nextFrame();
                    };

                    let blob = new Blob(new Uint8Array([1, 2, 3, 4]), {type: "application/octet-binary"});
                    let a = document.getElementById("download");
                    a.href = window.URL.createObjectURL(blob);
                    a.download = "test.wac";
                });
            };
        });
    };

})();

