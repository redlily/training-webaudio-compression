# Webで動作する音声圧縮の実証実験

## 概要

修正離散コサイン変換 (Modified Discrete Cosine Transform : MDCT) を使用したWebブラウザ上でJavaScriptを使用して
現実的な時間のエンコード、デコード可能な軽量な音声圧縮フォーマットの開発を目的とした実証実験用のプログラムです。

## Webアプリケーション

https://redlily.github.io/training-webaudio-compression

<img src="ss.png" />

### 使い方

1. 音声ファイル(おすすめは無圧縮)を選択してデータを読み込ませます。
1. 圧縮オプションを選び圧縮を実行、数秒から数十秒で圧縮が完了します。
1. 圧縮が完了すると再生ボタンとダウンロードリンクが有効になります。
1. 再生を押すと圧縮データの再生を開始、ダウンロードを押すと圧縮データのダウンロードを行います。
1. 圧縮したデータはこのプログラムでデータ読み込み、再生が出来ます。

## データフォーマット

### ヘッダ (HEADER)

|変数名|型|説明|
|:---|:---|:---|
|MAGIC_NUMBER|UINT32|データフォーマットの識別子、"WAD0"が固定値|
|DATA_SIZE|UINT32|データのサイズ|
|DATA_TYPE|UINT32|データのタイプ、現状は"SMD0"が固定値|
|DATA_TYPE|UINT32|データフォーマットのバージョン現状は0のみ|
|SAMPLE_RATE|UINT32|1秒間あたりのサンプリング数|
|CHANNEL_SIZE|UINT32|チャネル数、1ならモノラル、2ならステレオ|
|SAMPLE_COUNT|UINT32|データ全体でのサンプル数|

### フレーム (FRAME)

|変数名|型|説明|
|:---|:---|:---|
|FREQUENCY_SCALE|UINT32|各周波数のスケール値|
|FREQUENCY_DATA|FREQUENCY_DATA[CHANNEL_SIZE]|周波数データ|

### 周波数データ (FREQUENCY_DATA)

|変数名|型|説明|
|:---|:---|:---|
|FREQUENCY_FLAGS|UINT32[FREQUENCY_RANGE / 32]|各周波数のデータの有無を収納するフラグ配列|
|FREQUENCY_TABLE|UINT32[FREQUENCY_TABLES_IZE]|周波数テーブル、値は上位1ビットが符号、残りのビットが指数|