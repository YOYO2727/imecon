import { setGlobalOptions } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as functions from "firebase-functions"; // ← 必要！
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";

setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();
const db = admin.firestore();

const stripe = new Stripe(functions.config().stripe.secret, {
    apiVersion: "2025-06-30.basil", // 安定版を使用
});

export const createPaymentIntent = onCall(
    { region: "asia-northeast1", enforceAppCheck: true },
    async (request) => {
        const { data, auth } = request;

        if (!auth) {
            throw new HttpsError("unauthenticated", "ログインしてください。");
        }

        const userId = auth.uid;
        const amount: number = data.amount;
        const sessionId: string = data.sessionId;

        if (!amount || amount <= 0) {
            throw new HttpsError("invalid-argument", "金額が不正です。");
        }

        if (!sessionId) {
            throw new HttpsError("invalid-argument", "セッションIDが必要です。");
        }

        const idempotencyKey = uuidv4();

        const intent = await stripe.paymentIntents.create(
            {
                amount,
                currency: "jpy",
                capture_method: "manual",
                automatic_payment_methods: { enabled: true },
                metadata: { userId, sessionId },
            },
            { idempotencyKey }
        );

        await db.collection("payment_intents").doc(intent.id).set({
            userId,
            sessionId,
            amount,
            status: intent.status,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
            clientSecret: intent.client_secret,
            paymentIntentId: intent.id,
        };
    }
);
