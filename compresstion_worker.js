// 音声圧縮処理を行うためのWorker

importScripts("signal.js");
importScripts("codec.js");

self.addEventListener('message', (message) => {
    console.log(message.data, message.data.arrayBuffer.byteLength);
    let encoder = new wamCodec.WamEncoder(
        message.data.channelCount,
        message.data.sampleRate,
        message.data.frequencyRange,
        message.data.frequencyTableSize);
});
