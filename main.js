(function () {

    // UI関連

    // チャネル数選択
    let channelCountSelector;
    // サンプルレート選択
    let sampleRateSelector;
    // 周波数レンジ選択
    let frequencyRangeSelector;
    // 周波数テーブル選択
    let frequencyTableSizeSelector;
    // ファイルオープンボタン
    let openFileButton;
    // 圧縮ボタン
    let compressButton;
    // 再生ボタン
    let playButton;
    // ダウンロードボタン
    let downloadButton;

    // UI関連を初期化
    function initializeUI() {
        openFileButton = document.getElementById("openFileButton");
        openFileButton.addEventListener("change", onChangedSourceFile);
        channelCountSelector = document.getElementById("channelCountSelector");
        channelCountSelector.addEventListener("change", onChangedChannelCount);
        sampleRateSelector = document.getElementById("sampleRateSelector");
        sampleRateSelector.addEventListener("change", onChangedSampleRate);
        frequencyRangeSelector = document.getElementById("frequencyRangeSelector");
        frequencyRangeSelector.addEventListener("change", onChangedFrequencyRange);
        frequencyTableSizeSelector = document.getElementById("frequencyTableSizeSelector");
        frequencyTableSizeSelector.addEventListener("change", onChangedFrequencyTableSize);
        compressButton = document.getElementById("compressButton");
        compressButton.addEventListener("click", onClickedCompressButton);
        compressButton.disabled = "disabled";
        playButton = document.getElementById("playButton");
        playButton.addEventListener("click", onClickedPlayButton);
        downloadButton = document.getElementById("downloadButton");
    }

    // UI関連の後処理
    function terminateUI() {
        openFileButton.removeEventListener("change", onChangedSourceFile);
        channelCountSelector.removeEventListener("change", onChangedChannelCount);
        sampleRateSelector.removeEventListener("change", onChangedSampleRate);
        frequencyRangeSelector.removeEventListener("change", onChangedFrequencyRange);
        frequencyTableSizeSelector.removeEventListener("change", onChangedFrequencyTableSize);
        compressButton.removeEventListener("click", onClickedCompressButton);
        playButton.removeEventListener("click", onClickedPlayButton);
    }

    // 入力ファイルが変更
    function onChangedSourceFile(event) {
        console.log("Changed the source file");
        if (!isInitializedAudio()) {
            initializeAudio();
        }

        originalFile = event.target.files[0];
        let fileReader = new FileReader();
        fileReader.addEventListener("loadend", (event) => {
            // TODO: すでに圧縮されている場合の判定を入れる
            audioContext.decodeAudioData(fileReader.result).then((audioBuffer) => {
                originalAudioBuffer = audioBuffer;
                compressButton.disabled = "";
            });
        });
        fileReader.readAsArrayBuffer(originalFile);
    }

    // チャネル数が変更
    function onChangedChannelCount(event) {
        let value = this.options[this.selectedIndex].value;
        console.log("Changed the channel count from " + channelCount + " to " + value + ".");
        channelCount = Number.parseFloat(value);
    }

    // サンプルレートが変更
    function onChangedSampleRate(event) {
        let value = this.options[this.selectedIndex].value;
        console.log("Changed the sample rate from " + sampleRate + " to " + value + ".");
        sampleRate = Number.parseFloat(value);
    }

    // 周波数レンジが変更
    function onChangedFrequencyRange(event) {
        let value = this.options[this.selectedIndex].value;
        console.log(`Changed the frequency range from ${frequencyRange} to ${value}.`);
        frequencyRange = Number.parseFloat(value);
    }

    // 周波数テーブルサイズが変更
    function onChangedFrequencyTableSize(event) {
        let value = this.options[this.selectedIndex].value;
        console.log(`Changed the frequency table size from ${frequencyTableSize} to ${value}.`);
        frequencyTableSize = Number.parseFloat(value);
    }

    // 圧縮ボタンがクリックされた
    function onClickedCompressButton(event) {
        console.log("Clicked the compress button.");

        // Worker用にArrayBufferにデータを詰め直す
        let arrayBuffers = [new ArrayBuffer(16)];

        // Workerでエンコードを実行
        let worker = new Worker("compresstion_worker.js");
        worker.addEventListener('message', (message) => {
            switch (message.data["kind"]) {
                case "updateProgression":
                    break;
                case "completed":
                    worker.terminate();
                    makeDonwloadBlob(message.data["arrayBuffer"]);
                    makeCompressedAudioNode(message.data["arrayBuffer"]);
                    break;
                default:
                    worker.terminate();
                    break;
            }
        });
        worker.postMessage({
            "channelCount": channelCount,
            "sampleRate": sampleRate,
            "frequencyRange": frequencyRange,
            "frequencyTableSize": frequencyTableSize,
            "arrayBuffer": arrayBuffers
        }, arrayBuffers);
    }

    // ダウンロード用のBlobを作成
    function makeDonwloadBlob(buffer) {
        let blob = new Blob(new Uint8Array(buffer), {type: "application/octet-binary"});
        downloadButton.href = window.URL.createObjectURL(blob);
        downloadButton.download = "test.wac";
    }

    // 再生ボタンがクリックされた
    function onClickedPlayButton(event) {
        console.log("Clicked the play button.");

        if (audioSource == null) {
            audioSource = audioContext.createBufferSource();
            audioSource.connect(compressedAudioNode);
            compressedAudioNode.connect(audioContext.destination);
            audioSource.start();
        } else {
            audioSource.stop();
            compressedAudioNode.disconnect(audioContext.destination);
            audioSource.disconnect(compressedAudioNode);
            audioSource = null;
        }
    }

    // 音声関連

    // 入力元のファイル名
    let originalFile = null;

    // チャネル数
    let channelCount = 2;
    // サンプルレート
    let sampleRate = 44100;
    // 周波数レンジ
    let frequencyRange = 1024;
    // 周波数テーブルサイズ
    let frequencyTableSize = 192;

    // AudioContextのインスタンス
    let audioContext = null;
    // 再生用のAudioSource
    let audioSource = null;
    // 入力元のAudioBuffer
    let originalAudioBuffer = null;
    // 圧縮処理済みのAudioNode
    let compressedAudioNode = null;

    // Audioの初期化
    function initializeAudio() {
        if (!isInitializedAudio()) {
            return;
        }
        try {
            audioContext = new AudioContext();
        } catch (e) {
            console.error(e);
        }
    }

    // Audioの後処理
    function terminateAudio() {
        if (isInitializedAudio()) {
            return;
        }
        if (audioSource != null) {
            audioSource.stop();
            compressedAudioNode.disconnect(audioContext.destination);
            audioSource.disconnect(compressedAudioNode);
            audioSource = null;
        }
    }

    // Audioは初期化済みか
    function isInitializedAudio() {
        return audioContext != null;
    }

    // 圧縮されたデータ再生用のAudioNodeを作成
    function makeCompressedAudioNode(buffer) {
        let decoder = new wamCodec.WamDcoder(buffer);
        compressedAudioNode = audioContext.createScriptProcessor(4096, decoder.channelSize, decoder.channelSize);
        compressedAudioNode.addEventListener("audioprocess", (event) => {
            let sampleData = new Array(event.outputBuffer.numberOfChannels);
            for (let i = 0; i < sampleData.length; ++i) {
                sampleData[i] = event.outputBuffer.getChannelData(i);
            }
            for (let i = 0; i < event.outputBuffer.length / decoder.frequencyRange; ++i) {
                decoder.readFrame(sampleData, decoder.frequencyRange * i);
            }
        });
    }

    onload = function () {
        initializeUI();

        // TODO 下記は検証用の実装なので早々に書き換える

        openFileButton.addEventListener("change", function (event) {
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

                    let enc = new wamCodec.WamEncoder(sampleRate, channelSize, 1024, 192, sampleCount);
                    let sampleData = new Array(channelSize);
                    for (let k = 0; k < sampleData.length; ++k) {
                        sampleData[k] = audioBuf.getChannelData(k);
                    }
                    for (let k = 0; k < (sampleCount / 1024) - 1; ++k) {
                        enc.writeFrame(sampleData, 1024 * k, Math.min(1024, sampleCount - 1024 * (k + 1)));
                    }
                    let buf = enc.getDataBuffer();
                    console.log(buf.byteLength);

                    let dec = new wamCodec.WamDcoder(buf);
                    compressedAudioNode = audioContext.createScriptProcessor(4096, 2, 2);
                    compressedAudioNode.onaudioprocess = (event) => {
                        let sampleData = new Array(event.outputBuffer.numberOfChannels);
                        for (let i = 0; i < sampleData.length; ++i) {
                            sampleData[i] = event.outputBuffer.getChannelData(i);
                        }
                        for (let i = 0; i < event.outputBuffer.length / dec.frequencyRange; ++i) {
                            dec.readFrame(sampleData, dec.frequencyRange * i);
                        }
                    };
                });
            };
        });
    };

    onunload = function () {
        if (isInitializedAudio) {
            terminateAudio();
        }
        terminateUI();
    };

})();

