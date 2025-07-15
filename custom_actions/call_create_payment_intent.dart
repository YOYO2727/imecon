import 'package:cloud_functions/cloud_functions.dart';

Future<Map<String, dynamic>> callCreatePaymentIntent(
  String imeconId,
) async {
  try {
    final functions = FirebaseFunctions.instanceFor(region: 'asia-northeast1');
    final callable = functions.httpsCallable('createPaymentIntent');
    
    final result = await callable.call({
      'imeconId': imeconId,
    });
    
    final data = result.data as Map<String, dynamic>;
    
    return {
      'success': true,
      'clientSecret': data['clientSecret'],
      'paymentIntentId': data['paymentIntentId'],
      'ticketCode': data['ticketCode'],
    };
  } on FirebaseFunctionsException catch (e) {
    // Handle Firebase Functions specific errors
    String errorMessage = 'エラーが発生しました';
    
    switch (e.code) {
      case 'unauthenticated':
        errorMessage = 'ログインしてください';
        break;
      case 'invalid-argument':
        errorMessage = e.message ?? '入力が無効です';
        break;
      case 'failed-precondition':
        errorMessage = e.message ?? '条件が満たされていません';
        break;
      default:
        errorMessage = e.message ?? 'エラーが発生しました';
        break;
    }
    
    return {
      'success': false,
      'error': errorMessage,
      'errorCode': e.code,
    };
  } catch (e) {
    // Handle general errors
    return {
      'success': false,
      'error': 'エラーが発生しました: ${e.toString()}',
    };
  }
}