(function () {

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

                    let enc = new wamCodec.WamEncoder(sampleRate, channelSize, 1024, 256, sampleCount);
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
                    audioProcessor = audioContext.createScriptProcessor(4096, 2, 2);
                    audioProcessor.onaudioprocess = (event) => {
                        let sampleData = new Array(event.outputBuffer.numberOfChannels);
                        for (let i = 0; i < sampleData.length; ++i) {
                            sampleData[i] = event.outputBuffer.getChannelData(i);
                        }
                        for (let i = 0; i < event.outputBuffer.length / dec.frequencyRange; ++i) {
                            dec.readFrame(sampleData, dec.frequencyRange * i);
                        }
                    };

                    // let blob = new Blob(new Uint8Array(buf), {type: "application/octet-binary"});
                    // let a = document.getElementById("download");
                    // a.href = window.URL.createObjectURL(blob);
                    // a.download = "test.wac";
                });
            };
        });
    };

})();

