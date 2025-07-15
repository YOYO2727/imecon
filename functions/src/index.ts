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
        const amount: number = 7700;
        const imeconId: string = data.imeconId;

        if (!amount || amount <= 0) {
            throw new HttpsError("invalid-argument", "金額が不正です。");
        }

        if (!imeconId) {
            throw new HttpsError("invalid-argument", "イメコンIDが必要です。");
        }

        // Check if consultation is already pending
        const existingTicket = await db.collection("tickets")
            .where("user_ref", "==", db.doc(`users/${userId}`))
            .where("imecon_ref", "==", db.doc(`users/${imeconId}`))
            .where("status", "==", "authorized")
            .limit(1)
            .get();

        if (!existingTicket.empty) {
            throw new HttpsError("failed-precondition", "既に承認待ちの相談があります。");
        }

        const idempotencyKey = uuidv4();
        const ticketCode = uuidv4().substring(0, 8);

        const intent = await stripe.paymentIntents.create(
            {
                amount,
                currency: "jpy",
                capture_method: "manual",
                automatic_payment_methods: { enabled: true },
                metadata: { 
                    user_id: userId, 
                    imecon_id: imeconId,
                    ticket_type: "dm_consultation",
                    ticket_code: ticketCode
                },
            },
            { idempotencyKey }
        );

        // Create ticket document
        const ticketRef = db.collection("tickets").doc();
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours from now

        await ticketRef.set({
            user_ref: db.doc(`users/${userId}`),
            imecon_ref: db.doc(`users/${imeconId}`),
            status: "authorized",
            ticket_code: ticketCode,
            payment_intent_id: intent.id,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            expires_at: expiresAt,
            type: "dm_consultation",
        });

        // Update user document with ticket information
        await db.collection("users").doc(userId).update({
            available_ticket_codes: admin.firestore.FieldValue.arrayUnion(ticketCode),
            has_pending_consultation: true,
        });

        // Update imecon document with pending consultation
        await db.collection("users").doc(imeconId).update({
            dm_requests: admin.firestore.FieldValue.arrayUnion({
                user_id: userId,
                ticket_code: ticketCode,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            })
        });

        // Store payment intent info
        await db.collection("payment_intents").doc(intent.id).set({
            userId,
            amount,
            status: intent.status,
            ticket_code: ticketCode,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
            clientSecret: intent.client_secret,
            paymentIntentId: intent.id,
            ticketCode: ticketCode,
        };
    }
);

export const validateTicketCode = onCall(
    { region: "asia-northeast1", enforceAppCheck: true },
    async (request) => {
        const { data, auth } = request;

        if (!auth) {
            throw new HttpsError("unauthenticated", "ログインしてください。");
        }

        const userId = auth.uid;
        const ticketCode: string = data.ticketCode;

        if (!ticketCode) {
            throw new HttpsError("invalid-argument", "チケットコードが必要です。");
        }

        // Find ticket with the code
        const ticketQuery = await db.collection("tickets")
            .where("ticket_code", "==", ticketCode)
            .where("status", "==", "authorized")
            .limit(1)
            .get();

        if (ticketQuery.empty) {
            throw new HttpsError("not-found", "有効なチケットコードが見つかりません。");
        }

        const ticketDoc = ticketQuery.docs[0];
        const ticket = ticketDoc.data();

        // Check if ticket is expired
        const now = new Date();
        const expiresAt = ticket.expires_at.toDate();
        if (now > expiresAt) {
            throw new HttpsError("deadline-exceeded", "チケットの有効期限が切れています。");
        }

        // Check if user is authorized to use this ticket
        const userRef = db.doc(`users/${userId}`);
        if (!ticket.user_ref.isEqual(userRef)) {
            throw new HttpsError("permission-denied", "このチケットを使用する権限がありません。");
        }

        return {
            valid: true,
            ticket: {
                id: ticketDoc.id,
                imecon_id: ticket.imecon_ref.id,
                type: ticket.type,
                expires_at: ticket.expires_at,
            }
        };
    }
);

export const capturePaymentIntent = onCall(
    { region: "asia-northeast1", enforceAppCheck: true },
    async (request) => {
        const { data, auth } = request;

        if (!auth) {
            throw new HttpsError("unauthenticated", "ログインしてください。");
        }

        const paymentIntentId: string = data.paymentIntentId;

        if (!paymentIntentId) {
            throw new HttpsError("invalid-argument", "PaymentIntent IDが必要です。");
        }

        try {
            const intent = await stripe.paymentIntents.capture(paymentIntentId);
            
            // Update payment intent status in Firestore
            await db.collection("payment_intents").doc(paymentIntentId).update({
                status: intent.status,
                capturedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Update ticket status
            const ticketQuery = await db.collection("tickets")
                .where("payment_intent_id", "==", paymentIntentId)
                .limit(1)
                .get();

            if (!ticketQuery.empty) {
                await ticketQuery.docs[0].ref.update({
                    status: "captured",
                    captured_at: admin.firestore.FieldValue.serverTimestamp(),
                });
            }

            return {
                status: intent.status,
                captured: true,
            };
        } catch (error) {
            throw new HttpsError("internal", `決済の確定に失敗しました: ${error}`);
        }
    }
);

export const cancelPaymentIntent = onCall(
    { region: "asia-northeast1", enforceAppCheck: true },
    async (request) => {
        const { data, auth } = request;

        if (!auth) {
            throw new HttpsError("unauthenticated", "ログインしてください。");
        }

        const paymentIntentId: string = data.paymentIntentId;

        if (!paymentIntentId) {
            throw new HttpsError("invalid-argument", "PaymentIntent IDが必要です。");
        }

        try {
            const intent = await stripe.paymentIntents.cancel(paymentIntentId);
            
            // Update payment intent status in Firestore
            await db.collection("payment_intents").doc(paymentIntentId).update({
                status: intent.status,
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Update ticket status
            const ticketQuery = await db.collection("tickets")
                .where("payment_intent_id", "==", paymentIntentId)
                .limit(1)
                .get();

            if (!ticketQuery.empty) {
                const ticketDoc = ticketQuery.docs[0];
                const ticket = ticketDoc.data();
                
                await ticketDoc.ref.update({
                    status: "cancelled",
                    cancelled_at: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Clean up user records
                const userId = ticket.user_ref.id;
                const imeconId = ticket.imecon_ref.id;

                await db.collection("users").doc(userId).update({
                    available_ticket_codes: admin.firestore.FieldValue.arrayRemove(ticket.ticket_code),
                    has_pending_consultation: false,
                });

                await db.collection("users").doc(imeconId).update({
                    dm_requests: admin.firestore.FieldValue.arrayRemove({
                        user_id: userId,
                        ticket_code: ticket.ticket_code,
                        created_at: ticket.created_at
                    })
                });
            }

            return {
                status: intent.status,
                cancelled: true,
            };
        } catch (error) {
            throw new HttpsError("internal", `決済のキャンセルに失敗しました: ${error}`);
        }
    }
); 