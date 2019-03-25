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
    // すでに圧縮済みのファイルであることの表示
    let alreadyCompressedDataLabel;
    // チャネル数選択
    let channelSizeSelector;
    // サンプルレート選択
    let samplingRateSelector;
    // 周波数レンジ選択
    let frequencyRangeSelector;
    // MDCT処理レンジ選択
    let frequencyUpperLimitSelector;
    // 周波数テーブル選択
    let frequencyTableSizeSelector;
    // 圧縮後のビットレート
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
        alreadyCompressedDataLabel = document.getElementById("alreadyCompressedDataLabel");
        alreadyCompressedDataLabel.style.display = "none";
        channelSizeSelector = document.getElementById("channelSizeSelector");
        channelSizeSelector.addEventListener("change", onChangedChannelSize);
        samplingRateSelector = document.getElementById("samplingRateSelector");
        samplingRateSelector.addEventListener("change", onChangedSamplingRate);
        frequencyRangeSelector = document.getElementById("frequencyRangeSelector");
        frequencyRangeSelector.addEventListener("change", onChangedFrequencyRange);
        frequencyUpperLimitSelector = document.getElementById("frequencyUpperLimitSelector");
        frequencyUpperLimitSelector.addEventListener("change", onChangedFrequencyUpperLimit);
        frequencyTableSizeSelector = document.getElementById("frequencyTableSizeSelector");
        frequencyTableSizeSelector.addEventListener("change", onChangedFrequencyTableSize);
        compressedBitRateLabel = document.getElementById("compressedBitRateLabel");
        encodingRateLabel = document.getElementById("encodingRateLabel");
        compressButton = document.getElementById("compressButton");
        compressButton.addEventListener("click", onClickedCompressButton);
        compressButton.disabled = "disabled";
        playButton = document.getElementById("playButton");
        playButton.addEventListener("click", onClickedPlayButton);
        playButton.disabled = "disabled";
        downloadButton = document.getElementById("downloadButton");
        downloadButton.style.visibility = "hidden";
        updateBitRateOfCompressedAudio();
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
        playButton.disabled = "disabled";
        downloadButton.style.visibility = "hidden";

        if (isInitializedAudio()) {
            pauseAudio();
            initializeAudio();
        }

        originalFile = event.target.files[0];

        // 圧縮済みデータかをチェックする
        let fileReader = new FileReader();
        fileReader.addEventListener("loadend", (event) => {
            if (wamCodec.WamDcoder.isWamData(fileReader.result)) {
                makeCompressedAudioNode(fileReader.result);
                alreadyCompressedDataLabel.style.display = "inline";
                playButton.disabled = "";
            } else {
                alreadyCompressedDataLabel.style.display = "none";
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
        updateFrequencyUpperLimit();
        updateFrequencyTableSize();
        updateBitRateOfCompressedAudio();
    }

    // 周波数の上限が変更
    function onChangedFrequencyUpperLimit(event) {
        let value = frequencyUpperLimit;
        updateFrequencyUpperLimit();
        updateBitRateOfCompressedAudio();
        console.log(`Changed the frequency upper limit from ${value} to ${frequencyUpperLimit}.`);
    }

    // 周波数テーブルサイズが変更
    function onChangedFrequencyTableSize(event) {
        let prev = frequencyTableSize;
        updateFrequencyTableSize();
        updateBitRateOfCompressedAudio();
        console.log(`Changed the frequency table size from ${prev} to ${frequencyTableSize}.`);
    }

    // 周波数の上限を更新
    function updateFrequencyUpperLimit() {
        frequencyUpperLimit =
            frequencyRange *
            Number.parseFloat(frequencyUpperLimitSelector.options[frequencyUpperLimitSelector.selectedIndex].value) / 8;
    }

    // 周波数テーブルサイズの更新
    function updateFrequencyTableSize() {
        frequencyTableSize =
            FREQUENCY_TABLE_SIZES[frequencyTableSizeSelector.selectedIndex] * frequencyRange / DEFAULT_FREQUENCY_RANGE;
        for (let i = 0; i < FREQUENCY_TABLE_SIZES.length; ++i) {
            frequencyTableSizeSelector.options[i].text =
                `${Math.round(FREQUENCY_TABLE_SIZES[i] * frequencyRange / DEFAULT_FREQUENCY_RANGE)}`;
        }
    }

    // 圧縮後のビットレート
    function updateBitRateOfCompressedAudio() {
        // (主音量 + 副音量(8チャネル) + 周波数フラグ + 周波数テーブル) * チャネル数
        let frameSize = 32 + 32
            + (Math.min(
                1 * frequencyUpperLimit,
                Math.ceil(Math.ceil(Math.log2(frequencyUpperLimit)) * frequencyTableSize / 32) * 32)
                + 4 * frequencyTableSize)
            * channelSize;
        compressedBitRateLabel.textContent = `${Math.round(frameSize * samplingRate / frequencyRange / 1000)} kbps`;
    }

    // 圧縮ボタンがクリックされた
    function onClickedCompressButton(event) {
        console.log("Clicked the compress button.");

        compressButton.disabled = "disabled";
        playButton.disabled = "disabled";
        downloadButton.style.visibility = "hidden";

        pauseAudio();
        terminateAudio();
        initializeAudio();

        // ファイルの読み込み
        let fileReader = new FileReader();
        fileReader.addEventListener("loadend", (event) => {
            try {
                audioContext.decodeAudioData(fileReader.result, (audioBuffer) => {
                    encodeAudioData(audioBuffer).then((encodedBuffer) => {
                        makeDownloadLink(encodedBuffer);
                        makeCompressedAudioNode(encodedBuffer);
                        compressButton.disabled = "";
                        playButton.disabled = "";
                    }).catch((error) => {
                        compressButton.disabled = "";
                    });
                });
            } catch (error) {
                compressButton.disabled = "";
            }

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
                "frequencyUpperLimit": frequencyUpperLimit,
                "frequencyTableSize": frequencyTableSize,
                "originalSamplingRate": audioBuffer.sampleRate,
                "originalChannelSize": audioBuffer.numberOfChannels,
                "originalSampleData": sampleData
            }, sampleData.map((value => value.buffer)));
        });
    }

    // ダウンロード用のリンクを作成
    function makeDownloadLink(buffer) {
        let blob = new Blob([buffer], {type: "application/octet-binary"});
        downloadButton.href = window.URL.createObjectURL(blob);
        downloadButton.download = `${(originalFile.name.indexOf(".") != -1 ?
            originalFile.name.substring(0, originalFile.name.indexOf(".")) :
            originalFile.name)}.wac`;
        downloadButton.style.visibility = "visible";
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
    const FREQUENCY_TABLE_SIZES = [
        8,
        12,
        16,
        24,
        32,
        48,
        64,
        96,
        128,
        192,
        256,
        384,
        512,
    ];

    // デフォルト、サンプリングレート
    const DEFAULT_SAMPLING_RATE = 48000;
    // デフォルト、チャネル数
    const DEFAULT_CHANNEL_SIZE = 2;
    // デフォルト、周波数レンジ
    const DEFAULT_FREQUENCY_RANGE = 1024;
    // デフォルト、周波数の上限
    const DEFAULT_FREQUENCY_UPPER_LIMIT = DEFAULT_FREQUENCY_RANGE * 6 / 8;
    // デフォルト、周波数テーブルサイズ
    const DEFAULT_FREQUENCY_TABLE_SIZE = 192;

    // サンプリングレート
    let samplingRate = DEFAULT_SAMPLING_RATE;
    // チャネル数
    let channelSize = DEFAULT_CHANNEL_SIZE;
    // 周波数レンジ
    let frequencyRange = DEFAULT_FREQUENCY_RANGE;
    // 周波数の上限
    let frequencyUpperLimit = DEFAULT_FREQUENCY_UPPER_LIMIT;
    // 周波数テーブルサイズ
    let frequencyTableSize = DEFAULT_FREQUENCY_TABLE_SIZE;

    // 入力元のファイル名
    let originalFile = null;
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
    function initializeAudio(sampleRate = 48000) {
        if (isInitializedAudio()) {
            return;
        }
        try {
            audioContext = window.AudioContext != null ?
                new window.AudioContext({"sampleRate": sampleRate}) :
                new window.webkitAudioContext();
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
        audioContext = null;
    }

    // 圧縮されたデータ再生用のAudioNodeを作成
    function makeCompressedAudioNode(buffer) {
        let decoder = new wamCodec.WamDcoder(buffer);
        terminateAudio();
        initializeAudio(decoder.samplingRate);
        compressedAudioNode = audioContext.createScriptProcessor(4096, decoder.channelSize, decoder.channelSize);
        compressedAudioNode.addEventListener("audioprocess", (event) => {
            let sampleData = new Array(event.outputBuffer.numberOfChannels);
            for (let i = 0; i < sampleData.length; ++i) {
                sampleData[i] = event.outputBuffer.getChannelData(i);
            }

            // デコード
            let sampleTimes = audioContext.sampleRate / decoder.samplingRate;
            let sampleCount = Math.floor(event.outputBuffer.length / sampleTimes);
            decoder.read(sampleData, 0, sampleCount);

            // AudioContextとサンプリングレートが合わない場合は修正
            if (sampleTimes > 1) {
                for (let i = 0; i < decoder.channelSize; ++i) {
                    let samples = sampleData[i];
                    for (let j = sampleCount - 1; j >= 0; --j) {
                        let sample = samples[j];
                        for (let k = Math.floor(j * sampleTimes); k < Math.floor(j * sampleTimes) + sampleTimes; ++k) {
                            samples[k] = sample;
                        }
                    }
                }
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

