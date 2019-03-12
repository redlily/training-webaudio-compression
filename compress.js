// 音声圧縮処理を行うためのWorker

importScripts("signal.js");
importScripts("codec.js");

self.addEventListener("message", (message) => {
    // パラメータ取得
    let samplingRate = message.data["samplingRate"];
    let channelSize = message.data["channelSize"];
    let frequencyRange = message.data["frequencyRange"];
    let frequencyTableSize = message.data["frequencyTableSize"];
    let originalSamplingRate = message.data["originalSamplingRate"];
    let originalChannelSize = message.data["originalChannelSize"];
    let originalSampleData = message.data["originalSampleData"];
    let originalSampleCount = originalSampleData[0].length;
    let sampleCount = originalSampleCount;

    // サンプリングレートが元データと異なる場合
    if (samplingRate < originalSamplingRate) {
        // 減らす場合
        let times = originalSamplingRate / samplingRate;
        sampleCount = Math.floor(sampleCount / times);
        for (let i = 0; i < originalChannelSize; ++i) {
            let samples = originalSampleData[i];

            for (let j = 0; j < originalSampleCount; ++j) {
                samples[j] = samples[Math.floor(j * times)];
            }
        }
    } else if (samplingRate > originalSamplingRate) {
        // 増やす場合、増やさない
        samplingRate = originalSamplingRate;
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
    console.log(`sampling rate ${samplingRate}`);
    console.log(`channel size ${channelSize}`);
    console.log(`frequency range ${frequencyRange}`);
    console.log(`frequency table size ${frequencyTableSize}`);
    console.log(`sample count ${sampleCount}`);

    // エンコード
    let encoder = new wamCodec.WamEncoder(samplingRate, channelSize, frequencyRange, frequencyTableSize, sampleCount);
    for (let k = 0; k < (sampleCount / frequencyRange) - 1; ++k) {
        encoder.writeFrame(
            originalSampleData, frequencyRange * k, Math.min(frequencyRange, sampleCount - frequencyRange * (k + 1)));
        self.postMessage({
            "kind": "update",
            "progress": (k * frequencyRange) / sampleCount
        });
    }
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
