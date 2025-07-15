🎫 チケット購入ボタン押下時の要件定義書（Claude Code用）
1. 🎯 目的
このアクションは、ユーザーがイメージコンサルタントとの有料DM相談を希望する際に、Stripeの仮決済（オーソリ）を実行し、後続の相談開始フロー（＝メッセージ開始ボタンによるDMセッション作成）を可能とするための前提処理である。

2. 🔁 処理の流れ（アクションフロー）
✅ Step 1: Stripeの仮決済（オーソリ）を作成
Cloud Functions createPaymentIntent を呼び出し

パラメータ:

amount：チケット金額（例: 6000円）

currency: "jpy"

capture_method: "manual"（＝オーソリ）

metadata:

user_id: 一般ユーザーID

imecon_id: イメコンID

ticket_type: "dm_consultation"

返却値:

client_secret → FlutterFlowの showPaymentSheet へ渡す

✅ Step 2: showPaymentSheet でユーザーに決済画面を表示
client_secret を使ってStripe UIを表示し、ユーザーが支払い同意

成功時 → Step 3 へ進む

失敗時 → エラーハンドリング（ダイアログ表示＋購入フロー終了）

✅ Step 3: Firestore にチケット情報を登録
🔹 Collection: tickets
ドキュメント作成（チケットの実体）

フィールド構成：

user_ref: チケット購入者のUserドキュメント参照

imecon_ref: 対象イメコンのUser参照

status: "authorized"

ticket_code: ランダム生成（後で照合に使用）

payment_intent_id: StripeのIntent ID

created_at: 現在時刻

expires_at: created_at + 72h

type: "dm_consultation"

✅ Step 4: users コレクションにチケット情報を追加（一般ユーザー側）
該当ユーザーのドキュメントに以下を追加または更新：

available_ticket_codes: 配列（または単一文字列）で ticket_code を記録

has_pending_consultation: true

✅ Step 5: users コレクションに受取側（イメコン）向けのフラグを追加
該当イメコンのドキュメントに以下を追加：

pending_consultations: サブコレクションまたはフィールドで一般ユーザーとの未承認DM情報を記録

dm_requests[]: [user_id, ticket_code] などの構造で追加

✅ Step 6: チケットコードの自動入力または表示
ユーザーが次の「メッセージ開始」ステップに進めるように、下記のいずれかを実施：

生成された ticket_code を TextField に自動入力

または、「メッセージ開始」ボタンを有効化し、Action Flowがそのコードを取得できる状態にする

3. 📱 UI/UX要件との整合性
要件	対応
承認されるまでメッセージ送信不可	chat_room.status = "pending" で制御
承認までの残り時間管理	expires_at を元に Cloud Functions or Firestore で自動監視
72時間経過後のキャンセル	cancelPaymentIntent Cloud Function を使い、該当ドキュメントを status = "cancelled" に変更
購入後のUI案内	チャット画面に 「承認待ちです」 等を表示、送信UIはグレーアウト

4. 🔐 セキュリティルール／バリデーション要件（Claude実装時に考慮）
ticket_code は「使用済み」でない場合にのみ有効とする（status = "authorized"）

ticket_code の expires_at を過ぎたものは使えない（Cloud Functionまたはルールで判定）

同一 user_id × imecon_id に対して、72時間以内に複数 authorized チケットを作成させないようにする制限

チケットキャンセル／承認／使用済み反映は、StripeのWebhook + Cloud Functionで管理推奨

5. 🧠 後続処理（「メッセージ開始」ボタン押下）との連携要件
「メッセージ開始」時に、入力された ticket_code を参照し、対応するチケットの存在と有効性を確認

チャットルーム作成、チャット初期メッセージ、通知、ナビゲーションは別アクションに委譲

📎 備考
将来的には チケット種類の拡張（例：ビデオ通話用・回数券など） を想定し、ticket_type の抽象化が推奨される

メッセージ開始までの中断リカバリ処理（アプリ再起動時） に対応するため、チケットの created_at からの状態遷移設計が重要

