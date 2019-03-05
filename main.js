(function () {

    addEventListener("load", () => {
        initializeUI();
    });

    addEventListener("unload", () => {
        terminateAudio();
        terminateUI();
    });

    // UI関連

    // ファイルオープンボタン
    let openFileButton;
    // チャネル数選択
    let channelSizeSelector;
    // サンプルレート選択
    let samplingRateSelector;
    // 周波数レンジ選択
    let frequencyRangeSelector;
    // 周波数テーブル選択
    let frequencyTableSizeSelector;
    // 圧縮後の予想サイズ
    let compressedBitRateLabel;
    // エンコーディングの進捗率
    let encodingRateLabel;
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
        channelSizeSelector = document.getElementById("channelSizeSelector");
        channelSizeSelector.addEventListener("change", onChangedChannelSize);
        samplingRateSelector = document.getElementById("samplingRateSelector");
        samplingRateSelector.addEventListener("change", onChangedSamplingRate);
        frequencyRangeSelector = document.getElementById("frequencyRangeSelector");
        frequencyRangeSelector.addEventListener("change", onChangedFrequencyRange);
        frequencyTableSizeSelector = document.getElementById("frequencyTableSizeSelector");
        frequencyTableSizeSelector.addEventListener("change", onChangedFrequencyTableSize);
        compressedBitRateLabel = document.getElementById("compressedSizeLabel");
        encodingRateLabel = document.getElementById("encodingRateLabel");
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
        channelSizeSelector.removeEventListener("change", onChangedChannelSize);
        samplingRateSelector.removeEventListener("change", onChangedSamplingRate);
        frequencyRangeSelector.removeEventListener("change", onChangedFrequencyRange);
        frequencyTableSizeSelector.removeEventListener("change", onChangedFrequencyTableSize);
        compressButton.removeEventListener("click", onClickedCompressButton);
        playButton.removeEventListener("click", onClickedPlayButton);
    }

    // 入力ファイルが変更
    function onChangedSourceFile(event) {
        console.log("Changed the source file");

        playButton.disabled = "disabled";
        compressButton.disabled = "disabled";
        encodingRateLabel.textContent = "0%";

        initializeAudio();
        pauseAudio();

        originalFile = event.target.files[0];

        // 圧縮済みデータかをチェックする
        let fileReader = new FileReader();
        fileReader.addEventListener("loadend", (event) => {
            if (wamCodec.WamDcoder.isWamData(fileReader.result)) {
                makeCompressedAudioNode(fileReader.result);
                playButton.disabled = "";
            } else {
                compressButton.disabled = "";
            }
        });
        fileReader.readAsArrayBuffer(originalFile);
    }

    // チャネル数が変更
    function onChangedChannelSize(event) {
        let value = this.options[this.selectedIndex].value;
        console.log(`Changed the channel count from ${channelSize} to ${value}.`);
        channelSize = Number.parseFloat(value);
        updateBitRateOfCompressedAudio();
    }

    // サンプルレートが変更
    function onChangedSamplingRate(event) {
        let value = this.options[this.selectedIndex].value;
        console.log(`Changed the sample rate from ${samplingRate} to ${value}.`);
        samplingRate = Number.parseFloat(value);
        updateBitRateOfCompressedAudio();
    }

    // 周波数レンジが変更
    function onChangedFrequencyRange(event) {
        let value = this.options[this.selectedIndex].value;
        console.log(`Changed the frequency range from ${frequencyRange} to ${value}.`);
        frequencyRange = Number.parseFloat(value);
        updateBitRateOfCompressedAudio();
    }

    // 周波数テーブルサイズが変更
    function onChangedFrequencyTableSize(event) {
        let value = this.options[this.selectedIndex].value;
        console.log(`Changed the frequency table size from ${frequencyTableSize} to ${value}.`);
        frequencyTableSize = Number.parseFloat(value);
        updateBitRateOfCompressedAudio();
    }

    // 圧縮後のビットレート
    function updateBitRateOfCompressedAudio() {
        compressedBitRateLabel.textContent = "bps";
    }

    // 圧縮ボタンがクリックされた
    function onClickedCompressButton(event) {
        console.log("Clicked the compress button.");

        playButton.disabled = "disabled";
        compressButton.disabled = "disabled";

        initializeAudio();
        pauseAudio();

        // ファイルの読み込み
        let fileReader = new FileReader();
        fileReader.addEventListener("loadend", (event) => {
            audioContext.decodeAudioData(fileReader.result).then((audioBuffer) => {
                return encodeAudioData(audioBuffer);
            }).then((encodedBuffer) => {
                //makeDonwloadBlob(encodedBuffer);
                makeCompressedAudioNode(encodedBuffer);
                playButton.disabled = "";
                compressButton.disabled = "";
            }).catch((error) => {
                compressButton.disabled = "";
            });
        });
        fileReader.readAsArrayBuffer(originalFile);
    }

    // エンコーディング
    function encodeAudioData(audioBuffer) {
        return new Promise((resolve, reject) => {
            // サンプルを配列に詰め直し
            let sampleData = new Array(audioBuffer.numberOfChannels);
            for (let i = 0; i < sampleData.length; ++i) {
                sampleData[i] = audioBuffer.getChannelData(i);
            }

            // WebWorkerでエンコードを実行
            let worker = new Worker("compress.js");
            worker.addEventListener('message', (message) => {
                switch (message.data["kind"]) {
                    case "update":
                        encodingRateLabel.textContent = `${Math.ceil(message.data["progress"] * 100)} %`;
                        break;
                    case "completed": {
                        resolve(message.data["encodedBuffer"]);
                        worker.terminate();
                        break;
                    }
                    case "failed":
                    default:
                        reject(new Error("Failed to encoding"));
                        worker.terminate();
                        break;
                }
            });
            worker.postMessage({
                "channelSize": channelSize,
                "samplingRate": samplingRate,
                "frequencyRange": frequencyRange,
                "frequencyTableSize": frequencyTableSize,
                "sampleData": sampleData
            }, sampleData.map((value => value.buffer)));
        });
    }

    // ダウンロード用のBlobを作成
    function makeDonwloadBlob(buffer) {
        let blob = new Blob(new Uint8Array(buffer), {type: "application/octet-binary"});
        downloadButton.href = window.URL.createObjectURL(blob);
        downloadButton.download = originalFile.name + ".wac";
    }

    // 再生ボタンがクリックされた
    function onClickedPlayButton(event) {
        console.log("Clicked the play button.");

        if (!isPlayAudio()) {
            playAudio()
        } else {
            pauseAudio();
        }
    }

    // 音声関連

    // テーブルサイズマップ
    let FREQUENCY_TABLE_SIZES = {
        0: 256,
        1: 192,
        2: 128,
        3: 96,
        4: 64,
        5: 48,
        6: 32
    };

    // 入力元のファイル名
    let originalFile = null;

    // チャネル数
    let channelSize = 2;
    // サンプルレート
    let samplingRate = 48000;
    // 周波数レンジ
    let frequencyRange = 1024;
    // 周波数テーブルサイズ
    let frequencyTableSize = 192;

    // AudioContextのインスタンス
    let audioContext = null;
    // 再生用のAudioSource
    let audioSource = null;
    // 圧縮処理済みのAudioNode
    let compressedAudioNode = null;

    // Audioは初期化済みか
    function isInitializedAudio() {
        return audioContext != null;
    }

    // Audioの初期化
    function initializeAudio() {
        if (isInitializedAudio()) {
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
        if (!isInitializedAudio()) {
            return;
        }
        pauseAudio();
    }

    // 圧縮されたデータ再生用のAudioNodeを作成
    function makeCompressedAudioNode(buffer) {
        let decoder = new wamCodec.WamDcoder(buffer);
        audioContext = new AudioContext();
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

    // 再生中か否か
    function isPlayAudio() {
        return isInitializedAudio() && audioSource != null;
    }

    // 再生を行う
    function playAudio() {
        if (compressedAudioNode != null && isPlayAudio()) {
            return;
        }
        audioSource = audioContext.createBufferSource();
        audioSource.connect(compressedAudioNode);
        compressedAudioNode.connect(audioContext.destination);
        audioSource.start();
    }

    // 再生を中断する
    function pauseAudio() {
        if (!isPlayAudio()) {
            return;
        }
        audioSource.stop();
        compressedAudioNode.disconnect(audioContext.destination);
        audioSource.disconnect(compressedAudioNode);
        audioSource = null;
    }

})();

