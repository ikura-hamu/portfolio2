---
title: "左再帰の構文を再帰下降構文解析する"
pubDate: 2026-11-14T10:00:00+09:000
description: "左再帰の構文を再帰下降構文解析する"
tags: ["コンパイラ", "wooo", "Go"]
# heroImageContent: "./261113_parseleftrecursion.png" # optional
# heroImage: "./261113_parseleftrecursion.png" # optional
---

Go コンパイラを自作しています。

https://github.com/ikura-hamu/wooo

ときどきコンパイラを書く中で気づいたことと学んだことをブログに書いていこうと思います。

## 再帰下降構文解析

wooo では、再帰下降構文解析によって Go のプログラムをパースしています。これは[「低レイヤを知りたい人のためのCコンパイラ作成入門」](https://www.sigbus.info/compilerbook#%E6%96%87%E6%B3%95%E3%81%AE%E8%A8%98%E8%BF%B0%E6%96%B9%E6%B3%95%E3%81%A8%E5%86%8D%E5%B8%B0%E4%B8%8B%E9%99%8D%E6%A7%8B%E6%96%87%E8%A7%A3%E6%9E%90)を参考にしています。おおよそ一つの関数に構文の要素（構文木のノード）を対応させ、関数を再帰的に呼んでいくことで構文木を作っていきます。

https://ja.wikipedia.org/wiki/%E5%86%8D%E5%B8%B0%E4%B8%8B%E9%99%8D%E6%A7%8B%E6%96%87%E8%A7%A3%E6%9E%90

また、「低レイヤを知りたい人のためのCコンパイラ作成入門」では、二項演算子の優先度を文法に反映するという手法がとられています。

```ebnf
expr    = mul ("+" mul | "-" mul)*
mul     = unary ("*" unary | "/" unary)*
unary   = ("+" | "-")? primary
primary = num | "(" expr ")"
```

参照: https://www.sigbus.info/compilerbook#%E3%82%B9%E3%83%86%E3%83%83%E3%83%976%E5%8D%98%E9%A0%85%E3%83%97%E3%83%A9%E3%82%B9%E3%81%A8%E5%8D%98%E9%A0%85%E3%83%9E%E3%82%A4%E3%83%8A%E3%82%B9

優先度が構文に結びついているので、この文法に従ってパースしていけば、正しい計算順序の構文木が自然に得られます。

## 左再帰の文法

左再帰とは、非終端記号からその非終端記号自身を左端に含む文字列が導出されることです。

https://ja.wikipedia.org/wiki/%E5%B7%A6%E5%86%8D%E5%B8%B0

$$
A \rightarrow A\alpha \vert \beta
$$

($A$ は非終端記号、$\alpha$ と $\beta$ は任意の記号列)

このような文法で再帰下降構文解析を行うと、無限ループが発生するという問題があります。

例

```go
func A() (*node) {
  aNode := A() // A のなかで A を呼ぶのが続き、無限ループが発生
  alphaNode := alpha()

  return &node{
    Left:  aNode,
    Right: alphaNode,
  }
}
```

## Go の仕様に書いてある文法

Go の仕様 (https://go.dev/ref/spec) に書いてある文法の一部を抜き取ってくるとこんな感じです。

```ebnf
Expression
  = UnaryExpr | Expression binary_op Expression;

UnaryExpr
  = PrimaryExpr | unary_op UnaryExpr;
```

`Expression` が左再帰になっていることが分かると思います。

また、二項演算子の優先度は構文とは独立して記述されています。

https://go.dev/ref/spec#Operator_precedence

そのため、このままでは「低レイヤを知りたい人のためのCコンパイラ作成入門」にあるような構文解析をそのまま実装することはできません。

## 対応

再帰下降構文解析はとても書きやすいので、それが使えるようにすること、できるだけ Go の仕様に書いてある文法に近い形で処理を行うことの二つを目標として対応しました。

### 左再帰をやめる

再帰下降構文解析を行う以上は左再帰をどうにかしなくてはいけません。幸い、左再帰を除去する方法が知られています。今回の Go の文法であれば、

```ebnf
Expression = UnaryExpr { binary_op UnaryExpr };
```

のように置き換えることができます。先ほど書いた Go の仕様書にある文法と同じ意味です。（最初からこっちで書いてくれればいいのに）

### 構文木を組み立てるときに演算子の優先度を考慮する。

先ほど書き換えた `Expression` の定義を使うと、`Expression` をパースする関数はこのように書けます。

```go
func (p *parser) expression() (*expression, error) {
	lhs, err := p.unaryExpr()
	if err != nil {
		return nil, fmt.Errorf("unary expr: %w", err)
	}

	e := &expression{
		lhs: lhs,
	}

	for p.isBinOperator() { // 二項演算子があったらループする
		binaryOp := p.consumeToken()

		rhs, err := p.unaryExpr()
		if err != nil {
			return nil, fmt.Errorf("unary expr: %w", err)
		}

		// 構文木を作る
	}

	return e, nil
}
```

コメントの「構文木を作る」の部分で文法に従って愚直に構文木を組み立ててしまうと、後ろの計算が優先されるおかしな構文木になってしまいます。例えば `1+2-3` の構文木はこうなってしまいます。

```txt
Expression: +
            lhs: 1
            rhs: Expression: -
                             lhs: 2
                             rhs: 3
```

これだとまずいので、まずは左から順番に計算されるよう工夫します。具体的には、二項演算子を処理する際、既に読んだトークンを左辺に、新たに読んだトークンを右辺に配置します。

```go
func (p *parser) expression() (*expression, error) {
	lhs, err := p.unaryExpr()
	if err != nil {
		return nil, fmt.Errorf("unary expr: %w", err)
	}

	e := &expression{
		unaryExpr: lhs,
	}

	for p.isBinOperator() {
		binaryOp := p.consumeToken()

		rhs, err := p.unaryExpr()
		if err != nil {
			return nil, fmt.Errorf("unary expr: %w", err)
		}

		if !e.isBinary {
			e.binExpr = &binExpr{
				lhs:      &expression{unaryExpr: lhs}, // 左辺は先に読んでおいたもの
				binaryOp: binaryOp,
				rhs:      &expression{unaryExpr: rhs}, // 右辺は新しく読んだもの
			}
			e.unaryExpr = nil
		} else {
      e.binExpr = &binExpr{
				lhs: &expression{
					isBinary: true,
					binExpr: &binExpr{
						lhs:      e.binExpr.lhs,
						binaryOp: e.binExpr.binaryOp,
						rhs:      e.binExpr.rhs,
					},
				},
				binaryOp: binaryOp,
				rhs:      &expression{unaryExpr: rhs},
			}
			e.unaryExpr = nil
		}
		e.isBinary = true
	}

	return e, nil
}
```

これであれば、先に読んだ方が木が深くなり、計算順序が正しく構文木に表れています。

```txt
Expression: -
            lhs: Expression: +
                             lhs: 1
                             rhs: 2
            rhs: 3
```

これで優先度が同じ演算子の場合には正しく計算できるようになりました。しかし、現状ではどんな場合にも左から順に計算し、足し算と掛け算が混ざっているなど、優先度が異なる演算子の場合は正しく計算されません。

そこで、演算子の優先度を調べて、あとから来た演算子が優先される場合には、そちらの方向に木を伸ばすようにします。

```go
func (p *parser) expression() (*expression, error) {
	lhs, err := p.unaryExpr()
	if err != nil {
		return nil, fmt.Errorf("unary expr: %w", err)
	}

	e := &expression{
		unaryExpr: lhs,
	}

	for p.isBinOperator() {
		binaryOp := p.consumeToken()

		rhs, err := p.unaryExpr()
		if err != nil {
			return nil, fmt.Errorf("unary expr: %w", err)
		}

		if !e.isBinary {
			e.binExpr = &binExpr{
				lhs:      &expression{unaryExpr: lhs},
				binaryOp: binaryOp,
				rhs:      &expression{unaryExpr: rhs},
			}
			e.unaryExpr = nil
		} else {
			newBinOpStrength := binOpStrength[binaryOp.value]
			eBinOpStrength := binOpStrength[e.binExpr.binaryOp.value]

			if eBinOpStrength >= newBinOpStrength { // 演算子の強さを比較し、新しく読んだ演算子が強い場合には、そちらの方が木が深くなるようにする。
        // 通常の順番
				e.binExpr = &binExpr{
					lhs: &expression{
						isBinary: true,
						binExpr: &binExpr{
							lhs:      e.binExpr.lhs,
							binaryOp: e.binExpr.binaryOp,
							rhs:      e.binExpr.rhs,
						},
					},
					binaryOp: binaryOp,
					rhs:      &expression{unaryExpr: rhs},
				}
			} else {
        // あとから来た演算子が優先される逆の順番
				e.binExpr = &binExpr{
					lhs:      e.binExpr.lhs,
					binaryOp: e.binExpr.binaryOp,
					rhs: &expression{
						isBinary: true,
						binExpr: &binExpr{
							lhs:      e.binExpr.rhs,
							binaryOp: binaryOp,
							rhs:      &expression{unaryExpr: rhs},
						},
					},
				}
			}
			e.unaryExpr = nil
		}
		e.isBinary = true
	}

	return e, nil
}
```

これを行うと、`1+2*3` の構文木はこうなります。深いところにある 2×3 が先に計算されます。これで計算順序を正しく構文木に表すことができました。

```txt
Expression: +
            lhs: 1
            rhs: Expression: *
                             lhs: 2
                             rhs: 3
```

## おわり

構文をうまくプログラムで表現できると気持ちいい。
