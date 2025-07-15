import 'package:cloud_functions/cloud_functions.dart';

Future<Map<String, dynamic>> validateTicketCode(
  String ticketCode,
) async {
  try {
    final functions = FirebaseFunctions.instanceFor(region: 'asia-northeast1');
    final callable = functions.httpsCallable('validateTicketCode');
    
    final result = await callable.call({
      'ticketCode': ticketCode,
    });
    
    final data = result.data as Map<String, dynamic>;
    
    return {
      'success': true,
      'valid': data['valid'],
      'ticket': data['ticket'],
    };
  } on FirebaseFunctionsException catch (e) {
    // Handle Firebase Functions specific errors
    String errorMessage = 'エラーが発生しました';
    
    switch (e.code) {
      case 'unauthenticated':
        errorMessage = 'ログインしてください';
        break;
      case 'invalid-argument':
        errorMessage = e.message ?? 'チケットコードが無効です';
        break;
      case 'not-found':
        errorMessage = e.message ?? 'チケットコードが見つかりません';
        break;
      case 'deadline-exceeded':
        errorMessage = e.message ?? 'チケットの有効期限が切れています';
        break;
      case 'permission-denied':
        errorMessage = e.message ?? 'このチケットを使用する権限がありません';
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