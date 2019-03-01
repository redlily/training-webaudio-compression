// 信号処理用のユーティリティ

/**
 * 高速離散フーリエ変換用のクラス
 * 
 * アルゴリズムは Cooly and Tukey
 * 
 * y[2k] = Σ[N-1,j=0] (x[j] + x[N/2 + j]) e^((-2πijk) / (N/2))
 * y[2k-1] = Σ[N-1,j=0] ((x[j] - x[N/2 + j]) e^(-2πik / N)) e^((-2πijk) / (N/2))
 * 
 * N - データ数
 * x - サンプリング配列
 * y - 周波数配列
 * j - サンプリング配列の添字 (時間)
 * k - 周波数配列への添字 (周波数)
 * i - 単位虚数
 */
class FastDFT {

    // 要素を入れ替える
    static swap(v, a, b) {
        let ar = v[a + 0];
        let ai = v[a + 1];
        v[a + 0] = v[b + 0];
        v[a + 1] = v[b + 1];
        v[b + 0] = ar;
        v[b + 1] = ai;
    }

    // 離散フーリエ変換
    // n - サンプル数、2のべき乗である必要がある
    // x - 変換対象のサンプル配列、実数と虚数のn個の複素数配列
    // inv - 逆変換か否か
    static dft(n, x, inv) {
        inv = inv == null ? false : inv;

        let rad = (inv ? 2.0 : -2.0) * Math.PI / n;
        let cs = Math.cos(rad), sn = Math.sin(rad); // 回転因子の回転用複素数

        for (let m = (n <<= 1), mh; 2 <= (mh = m >>> 1); m = mh) {
            // 回転因子が0°の箇所を処理
            for (let i = 0; i < n; i += m) {
                let j = i + mh;
                let ar = x[i + 0], ai = x[i + 1];
                let br = x[j + 0], bi = x[j + 1];

                // 前半 (a + b)
                x[i + 0] = ar + br;
                x[i + 1] = ai + bi;

                // 後半 (a - b)
                x[j + 0] = ar - br;
                x[j + 1] = ai - bi;
            }

            // 回転因子が0°以外の箇所を処理
            let wcs = cs, wsn = sn; // 回転因子

            for (let i = 2; i < mh; i += 2) {
                for (let j = i; j < n; j += m) {
                    let k = j + mh;
                    let ar = x[j + 0], ai = x[j + 1];
                    let br = x[k + 0], bi = x[k + 1];

                    // 前半 (a + b)
                    x[j + 0] = ar + br;
                    x[j + 1] = ai + bi;

                    // 後半 (a - b) * w
                    let xr = ar - br;
                    let xi = ai - bi;
                    x[k + 0] = xr * wcs - xi * wsn;
                    x[k + 1] = xr * wsn + xi * wcs;
                }

                // 回転因子を回転
                let tcs = wcs * cs - wsn * sn;
                wsn = wcs * sn + wsn * cs;
                wcs = tcs;
            }

            // 回転因子の回転用の複素数を自乗して回転
            let tcs = cs * cs - sn * sn;
            sn = 2.0 * (cs * sn);
            cs = tcs;
        }

        let m = n >>> 1;
        let m2 = m + 2;
        let mh = n >>> 2;
        for (let i = 0, j = 0; i < m; i += 4) {
            // データの入れ替え
            FastDFT.swap(x, i + m, j + 2);
            if (i < j) {
                FastDFT.swap(x, i + m2, j + m2);
                FastDFT.swap(x, i, j);
            }

            // ビットオーダを反転した変数としてインクリメント
            for (let k = mh; (j ^= k) < k; k >>= 1) {
            }
        }

        // 逆変換用のスケーリング
        if (inv) {
            for (let i = 0; i < n; ++i) {
                x[i] /= n;
            }
        }
    }
}

// 高速離散コサイン変換用のクラス、タイプIIとタイプIIIを備える
// アルゴリズムは Byeong Gi Lee
class FastDCT {

    // 要素を入れ替える
    static swap(v, a, b) {
        let t = v[a];
        v[a] = v[b];
        v[b] = t;
    }

    // 要素配列の並び替え
    static swapElements(n, x) {
        let nh = n >> 1;
        let nh1 = nh + 1;
        let nq = n >> 2;
        for (let i = 0, j = 0; i < nh; i += 2) {
            FastDCT.swap(x, i + nh, j + 1);
            if (i < j) {
                FastDCT.swap(x, i + nh1, j + nh1);
                FastDCT.swap(x, i, j);
            }

            // ビットオーダを反転した変数としてインクリメント
            for (let k = nq; (j ^= k) < k; k >>= 1) {
            }
        }
    }

    // 離散コサイン変換、タイプII
    // n - サンプル数、2のべき乗である必要がある
    // x - n個のサンプルの配列
    static dctII(n, x) {
        // バタフライ演算
        let rad = Math.PI / (n << 1);
        for (let m = n, mh = m >> 1; 1 < m; m = mh, mh >>= 1) {
            for (let i = 0; i < mh; ++i) {
                let cs = 2.0 * Math.cos(rad * ((i << 1) + 1));
                for (let j = i, k = (m - 1) - i; j < n; j += m, k += m) {
                    let x0 = x[j];
                    let x1 = x[k];
                    x[j] = x0 + x1;
                    x[k] = (x0 - x1) * cs;
                }
            }
            rad *= 2.0;
        }

        // データの入れ替え
        FastDCT.swapElements(n, x);

        // 差分方程式
        for (let m = n, mh = m >> 1, mq = mh >> 1; 2 < m; m = mh, mh = mq, mq >>= 1) {
            for (let i = mq + mh; i < m; ++i) {
                let xt = (x[i] = -x[i] - x[i - mh]);
                for (let j = i + mh; j < n; j += m) {
                    let k = j + mh;
                    xt = (x[j] -= xt);
                    xt = (x[k] = -x[k] - xt);
                }
            }
        }

        // スケーリング
        for (let i = 1; i < n; ++i) {
            x[i] *= 0.5;
        }
    }

    // 離散コサイン変換、タイプIII
    // n - サンプル数、2のべき乗である必要がある
    // x - n個のサンプルの配列
    static dctIII(n, x) {
        // スケーリング
        x[0] *= 0.5;

        // 差分方程式
        for (let m = 4, mh = 2, mq = 1; m <= n; mq = mh, mh = m, m <<= 1) {
            for (let i = n - mq; i < n; ++i) {
                let j = i;
                while (m < j) {
                    let k = j - mh;
                    x[j] = -x[j] - x[k];
                    x[k] += x[j = k - mh];
                }
                x[j] = -x[j] - x[j - mh];
            }
        }

        // データの入れ替え
        FastDCT.swapElements(n, x);

        // バタフライ演算
        let rad = Math.PI / 2.0;
        for (let m = 2, mh = 1; m <= n; mh = m, m <<= 1) {
            rad *= 0.5;
            for (let i = 0; i < mh; ++i) {
                let cs = 2.0 * Math.cos(rad * ((i << 1) + 1));
                for (let j = i, k = (m - 1) - i; j < n; j += m, k += m) {
                    let x0 = x[j];
                    let x1 = x[k] / cs;
                    x[j] = x0 + x1;
                    x[k] = x0 - x1;
                }
            }
        }
    }
}

// 高速修正離散コサイン変換用のクラス
// アルゴリズムは Mu-Huo Cheng and Yu-Hsin Hsu
class FastMDCT {

    // 修正コサイン変換
    // n - 周波数配列数、2のべき乗である必要がある
    // samples - 2n個のサンプル配列、この配列が変換処理の入力元となる
    // frequencies - n個の周波数配列、この配列が変換処理の出力先となる
    static mdct(n, samples, frequencies) {
        // データを結合
        let ns1 = n - 1;            // n - 1
        let nd2 = n >> 1;           // n / 2
        let nm3d4 = n + nd2;        // n * 3 / 4
        let nm3d4s1 = nm3d4 - 1;    // n * 3 / 4 - 1
        for (let i = 0; i < nd2; ++i) {
            frequencies[i] = samples[nm3d4 + i] + samples[nm3d4s1 - i];
            frequencies[nd2 + i] = samples[i] - samples[ns1 - i];
        }

        // cos値の変換用の係数をかけ合わせ
        let rad = Math.PI / (n << 2);
        let i = 0;
        let nh = n >> 1;
        for (; i < nh; ++i) {
            frequencies[i] /= -2.0 * Math.cos(rad * ((i << 1) + 1));
        }
        for (; i < n; ++i) {
            frequencies[i] /= 2.0 * Math.cos(rad * ((i << 1) + 1));
        }

        // DCT-II
        FastDCT.dctII(n, frequencies);

        // 差分方程式
        for (let i = 0, j = 1; j < n; i = j++) {
            frequencies[i] += frequencies[j];
        }
    }

    // 逆修正コサイン変換
    // n - 周波数配列数、2のべき乗である必要がある
    // samples - 2n個のサンプル配列、この配列が変換処理の出力先となる
    // frequencies - n個の周波数配列、この配列が変換処理の入力元となる
    static imdct(n, samples, frequencies) {
        // TODO 入力元である周波数配列を破壊してしまうので作業用バッファを用いるか、破壊して良い出力先のsamplesを作業用バッファとして用いる
        
        // cos値の変換用係数を掛け合わせ
        let rad = Math.PI / (n << 2);
        for (let i = 0; i < n; ++i) {
            frequencies[i] *= 2.0 * Math.cos(rad * ((i << 1) + 1));
        }

        // DCT-II
        FastDCT.dctII(n, frequencies);

        // 差分方程式
        frequencies[0] *= 0.5;
        let i = 0, j = 1;
        let nh = n >> 1;
        for (; i < nh; i = j++) {
            frequencies[j] += (frequencies[i] = -frequencies[i]);
        }
        for (; j < n; i = j++) {
            frequencies[j] -= frequencies[i];
        }

        // スケーリング
        for (let i = 0; i < n; ++i) {
            frequencies[i] /= n;
        }

        // データを分離
        let ns1 = n - 1;            // n - 1
        let nd2 = n >> 1;           // n / 2
        let nm3d4 = n + nd2;        // n * 3 / 4
        let nm3d4s1 = nm3d4 - 1;    // n * 3 / 4 - 1
        for (let i = 0; i < nd2; ++i) {
            samples[ns1 - i] = -(samples[i] = frequencies[nd2 + i]);
            samples[nm3d4 + i] = (samples[nm3d4s1 - i] = frequencies[i]);
        }
    }
}
