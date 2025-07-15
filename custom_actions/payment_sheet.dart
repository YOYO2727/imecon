import 'package:flutter_stripe/flutter_stripe.dart';

Future<Map<String, dynamic>> showPaymentSheet(
  String clientSecret,
  String paymentIntentId,
) async {
  try {
    // Configure the payment sheet
    await Stripe.instance.initPaymentSheet(
      paymentSheetParameters: SetupPaymentSheetParameters(
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'イメコン',
        style: ThemeMode.system,
        billingDetails: const BillingDetails(
          name: null,
          email: null,
        ),
      ),
    );

    // Present the payment sheet
    await Stripe.instance.presentPaymentSheet();

    // If we get here, payment was successful
    return {
      'success': true,
      'paymentIntentId': paymentIntentId,
      'message': '決済が完了しました',
    };
  } on StripeException catch (e) {
    // Handle Stripe-specific errors
    String errorMessage = 'エラーが発生しました';
    
    switch (e.error.code) {
      case FailureCode.Canceled:
        errorMessage = '決済がキャンセルされました';
        break;
      case FailureCode.Failed:
        errorMessage = '決済に失敗しました';
        break;
      case FailureCode.Timeout:
        errorMessage = '決済がタイムアウトしました';
        break;
      default:
        errorMessage = e.error.localizedMessage ?? 'エラーが発生しました';
        break;
    }
    
    return {
      'success': false,
      'error': errorMessage,
      'errorCode': e.error.code.toString(),
    };
  } catch (e) {
    // Handle general errors
    return {
      'success': false,
      'error': 'エラーが発生しました: ${e.toString()}',
    };
  }
}