FlutterFlowの実際のUIと現在のActionフローを踏まえて、**最新のStripe仮決済付きチャット機能に対応した要件定義書（更新版）**を以下にまとめます。

✅ Stripeオーソリ付きチャット機能 要件定義書（改訂版）
1. プロジェクト概要
アプリ名：「イメコン」

機能内容：ユーザーがイメージコンサルタントに相談するためのチャットチケットを購入する。支払いは仮決済（オーソリ）としてStripeで処理し、チャット終了後に決済を確定（キャプチャ）する。

UI設計：

「チケットコードを入力」欄と「チケットを購入する」ボタンがあり、どちらかを通って初めてチャットセッションが可能

2. ユーザーフロー（チャット開始まで）
✅ A. チケットコードが入力された場合（招待 or 特典）
入力値とFirestore上の有効なコードを照合（Condition判定）

該当コードがあれば：

Firestoreにセッション用データを作成

チャットセッションを作成

チャット画面（DMRoom）に遷移

✅ B. チケットコードが未入力 → Stripeで仮決済する場合
「チケットを購入する」ボタンをタップ

Firebase Cloud Functions：createPaymentIntent を呼び出す

amount: 5000（例）

sessionId: UUID or Firestore上のdocument ID

→ clientSecret をFlutterFlowに返す

FlutterFlow内のカスタムアクションで PaymentSheet を表示

ユーザーがカード情報を入力 → Stripe側でオーソリ完了

チャットセッションのFirestore作成・通知

チャット画面（DMRoom）に遷移

3. Stripe決済仕様（オーソリ→キャプチャ型）
項目	内容
支払い方式	PaymentIntent（capture_method: manual）
仮決済金額	5000円（初回30分分）※変更可能
決済手順	createPaymentIntent → PaymentSheet → 成功後にチャット開始
決済確定	セッション終了後、capturePaymentIntent を手動で呼び出し（または自動）
再決済対応	30分超過時にセッション終了 → 再仮決済で再開
キャンセル対応	72時間以内にキャプチャされなかった場合自動キャンセル（またはボタンキャンセル）

4. 技術構成
領域	技術
UI構築	FlutterFlow
決済処理	Stripe（flutter_stripe SDK + Cloud Functions）
決済関数	createPaymentIntent, capturePaymentIntent, cancelPaymentIntent
カスタムコード	FlutterFlow内に Dart の Custom Action（PaymentSheet表示用）
サーバー	Firebase Cloud Functions（TypeScript）
DB	Firestore（セッション・決済・ユーザー管理）
認証	Firebase Auth（UIDでひもづけ）

5. Firestoreドキュメント構成（案）
plaintext
コードをコピーする
payment_intents/{intentId}
  ├── userId
  ├── sessionId
  ├── amount
  ├── status: created / requires_capture / captured / canceled
  ├── createdAt
  ├── capturedAt
  └── metadata
6. 今後の追加要件（予定）
✅ capturePaymentIntent 関数の実装（チャット終了時の決済）

✅ 自動キャンセル処理の実装（Webhook or 定期実行）

✅ セッションタイマーと30分制限の導入

✅ Stripe Webhook の導入（ステータス同期）

7. 補足：UI動作の整理（FlutterFlow）
UI要素	機能
「チケットコードを入力」	Firestoreで有効コードか確認 → DM開始
「チケットを購入する」	Stripe仮決済（PaymentIntent） → 成功後にDM開始
「メッセージを開始」ボタン	上記いずれかの条件を通った場合のみ有効

✅ 次に進む提案
capturePaymentIntent 関数を実装する

Payment完了後にFirestoreの payment_intents を captured に更新

セッション終了処理との統合
