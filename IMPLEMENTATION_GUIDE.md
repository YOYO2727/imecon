# チケット購入機能 実装ガイド

## 概要
この実装では、FlutterFlowでチケット購入ボタンを押した際の完全な処理フローを提供します。

## 実装されたファイル

### 1. Cloud Functions (`functions/src/index.ts`)
- **createPaymentIntent**: Stripe仮決済作成、チケット生成、Firestore更新
- **validateTicketCode**: チケットコードの有効性検証
- **capturePaymentIntent**: 決済確定処理
- **cancelPaymentIntent**: 決済キャンセル処理

### 2. FlutterFlow Custom Actions
- **callCreatePaymentIntent**: Cloud Functionの呼び出し
- **showPaymentSheet**: Stripe決済画面表示
- **validateTicketCode**: チケットコード検証

### 3. Firestore Security Rules (`firestore.rules`)
- tickets, payment_intents, chat_rooms, users コレクションの適切なセキュリティルール

## FlutterFlowでの実装手順

### Step 1: カスタムアクションの追加
1. FlutterFlowで以下のカスタムアクションを追加:
   - `custom_actions/call_create_payment_intent.dart`
   - `custom_actions/payment_sheet.dart`
   - `custom_actions/validate_ticket_code.dart`

### Step 2: 依存関係の追加
pubspec.yamlに以下を追加:
```yaml
dependencies:
  flutter_stripe: ^latest_version
  cloud_functions: ^latest_version
```

### Step 3: アクションフローの構築
チケット購入ボタンのアクションフローを以下のように構築:

1. **callCreatePaymentIntent** を呼び出し
   - パラメータ: `imeconId`, `amount` (デフォルト: 6000)
   - 成功時: `clientSecret`, `paymentIntentId`, `ticketCode` を取得

2. **showPaymentSheet** を呼び出し
   - パラメータ: `clientSecret`, `paymentIntentId`
   - 成功時: チケットコードを自動入力またはセッション変数に保存

3. **条件分岐**:
   - 成功時: チャット画面に遷移
   - 失敗時: エラーダイアログ表示

### Step 4: チケットコード入力フロー
チケットコード入力時のアクションフロー:

1. **validateTicketCode** を呼び出し
   - パラメータ: `ticketCode`
   - 成功時: チケット情報を取得してチャット画面に遷移

## Firestore データ構造

### tickets コレクション
```json
{
  "user_ref": "users/{userId}",
  "imecon_ref": "users/{imeconId}",
  "status": "authorized",
  "ticket_code": "8文字のランダムコード",
  "payment_intent_id": "pi_xxxxxxxx",
  "created_at": "timestamp",
  "expires_at": "timestamp（72時間後）",
  "type": "dm_consultation"
}
```

### payment_intents コレクション
```json
{
  "userId": "user_id",
  "imeconId": "imecon_id",
  "amount": 6000,
  "status": "requires_capture",
  "ticket_code": "8文字のランダムコード",
  "createdAt": "timestamp"
}
```

### users コレクション更新
```json
{
  "available_ticket_codes": ["ticket_code1", "ticket_code2"],
  "has_pending_consultation": true,
  "dm_requests": [
    {
      "user_id": "user_id",
      "ticket_code": "ticket_code",
      "created_at": "timestamp"
    }
  ]
}
```

## UI/UX制御

### 承認待ち状態の表示
チャット画面で以下の条件をチェック:
- `ticket.status == "authorized"`
- `ticket.expires_at > 現在時刻`

表示メッセージ:
```
現在コンサルタントの承認待ちです
承認されるまでメッセージや写真の送信はできません
3日以内に承認されない場合、料金の引き落としはキャンセルされます
```

### 送信ボタンの制御
- `ticket.status == "authorized"`: グレーアウト
- `ticket.status == "approved"`: 有効
- `ticket.status == "cancelled"` or `ticket.status == "rejected"`: グレーアウト

## エラーハンドリング

### 一般的なエラー
- `unauthenticated`: 「ログインしてください」
- `invalid-argument`: 「入力が無効です」
- `failed-precondition`: 「既に承認待ちの相談があります」
- `not-found`: 「有効なチケットコードが見つかりません」
- `deadline-exceeded`: 「チケットの有効期限が切れています」

### 決済エラー
- `Canceled`: 「決済がキャンセルされました」
- `Failed`: 「決済に失敗しました」
- `Timeout`: 「決済がタイムアウトしました」

## デプロイ手順

1. Cloud Functionsのデプロイ:
```bash
cd functions
npm run build
firebase deploy --only functions
```

2. Firestore Security Rulesのデプロイ:
```bash
firebase deploy --only firestore:rules
```

3. Stripe設定の確認:
```bash
firebase functions:config:set stripe.secret="sk_test_..."
```

## 注意事項

1. **セキュリティ**: Stripe秘密鍵は環境変数で管理
2. **バリデーション**: 全てのユーザー入力を検証
3. **エラーハンドリング**: 適切なエラーメッセージを表示
4. **パフォーマンス**: Firestore読み書き回数を最適化
5. **テスト**: 実際の決済前にテストモードで動作確認

## 今後の拡張

- 自動キャンセル処理（Cloud Scheduler + Cloud Functions）
- Webhook連携（Stripe → Firebase）
- 分析・レポート機能
- 複数チケット種類対応