// 音声圧縮処理を行うためのWorker

importScripts("signal.js");
importScripts("codec.js");

self.addEventListener("message", (message) => {
    // パラメータ取得
    let channelSize = message.data["channelSize"];
    let samplingRate = message.data["samplingRate"];
    let frequencyRange = message.data["frequencyRange"];
    let frequencyTableSize = message.data["frequencyTableSize"];
    let sampleData = message.data["sampleData"];
    let sampleCount = sampleData[0].length;

    console.log(`encoding`);
    console.log(`channel size ${channelSize}`);
    console.log(`sampling rate ${samplingRate}`);
    console.log(`frequency range ${frequencyRange}`);
    console.log(`frequency table size ${frequencyTableSize}`);
    console.log(`sample count ${sampleCount}`);

    // エンコード
    let encoder = new wamCodec.WamEncoder(samplingRate, channelSize, frequencyRange, frequencyTableSize, sampleCount);
    for (let k = 0; k < (sampleCount / frequencyRange) - 1; ++k) {
        encoder.writeFrame(
            sampleData, frequencyRange * k, Math.min(frequencyRange, sampleCount - frequencyRange * (k + 1)));
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
    }, encodedBuffer);
});
