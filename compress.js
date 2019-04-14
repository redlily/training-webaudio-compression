// 音声圧縮処理を行うためのWorker

importScripts("signal.js");
importScripts("codec.js");

self.addEventListener("message", (message) => {
    // パラメータ取得
    let sampleRate = message.data["sampleRate"];
    let channelSize = message.data["numChannels"];
    let frequencyRange = message.data["frequencyRange"];
    let frequencyUpperLimit = message.data["frequencyUpperLimit"];
    let frequencyTableSize = message.data["frequencyTableSize"];
    let originalSampleRate = message.data["originalSampleRate"];
    let originalChannelSize = message.data["originalChannelSize"];
    let originalSampleData = message.data["originalSampleData"];
    let originalSampleCount = originalSampleData[0].length;
    let sampleCount = originalSampleCount;

    // サンプリングレートが元データと異なる場合
    if (sampleRate < originalSampleRate) {
        // 減らす場合
        let times = originalSampleRate / sampleRate;
        sampleCount = Math.floor(sampleCount / times);
        for (let i = 0; i < originalChannelSize; ++i) {
            let samples = originalSampleData[i];

            for (let j = 0; j < originalSampleCount; ++j) {
                samples[j] = samples[Math.floor(j * times)];
            }
        }
    } else if (sampleRate > originalSampleRate) {
        // 増やす場合、増やさない
        sampleRate = originalSampleRate;
    }

    // チャネル数が元データと異なる場合
    if (channelSize == 1 && originalChannelSize == 2) {
        // 減らす場合
        let left = originalSampleData[0];
        let right = originalSampleData[1];
        for (let i = 0; i < sampleCount; ++i) {
            left[i] += right[i];
        }
    } else if (channelSize > sampleCount) {
        // 増やす場合、増やさない
        channelSize = originalChannelSize;
    }

    console.log(`encoding`);
    console.log(`sample rate ${sampleRate}`);
    console.log(`channel size ${channelSize}`);
    console.log(`frequency range ${frequencyRange}`);
    console.log(`frequency upper limit ${frequencyUpperLimit}`);
    console.log(`frequency table size ${frequencyTableSize}`);
    console.log(`sample count ${sampleCount}`);

    // エンコード
    let encoder = new wamCodec.WamEncoder(
        sampleRate, channelSize,
        frequencyRange, frequencyUpperLimit, frequencyTableSize,
        sampleCount);
    for (let k = 0; k < (sampleCount / frequencyRange) - 1; ++k) {
        encoder.write(originalSampleData, frequencyRange * k, Math.min(frequencyRange, sampleCount - frequencyRange * (k + 1)));
        self.postMessage({
            "kind": "update",
            "progress": (k * frequencyRange) / sampleCount
        });
    }
    encoder.flush();
    self.postMessage({
        "kind": "update",
        "progress": 1.0
    });

    // 結果を返す
    let encodedBuffer = encoder.getDataBuffer();
    self.postMessage({
        "kind": "completed",
        "encodedBuffer": encodedBuffer,
    }, [encodedBuffer]);
});
