const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 2 });

const db = admin.firestore();
const messaging = admin.messaging();

async function getPushTokens(excludeUser) {
  const snap = await db.collection('bluefix_push_tokens').get();
  return snap.docs
    .map(d => ({ ref: d.ref, ...d.data() }))
    .filter(x => x.token && x.user !== excludeUser);
}

async function sendPush({ title, body, excludeUser, tag }) {
  const recipients = await getPushTokens(excludeUser);
  if (!recipients.length) return;

  // FCM erlaubt maximal 500 Tokens pro Multicast-Aufruf.
  for (let i = 0; i < recipients.length; i += 500) {
    const batch = recipients.slice(i, i + 500);
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map(x => x.token),
      notification: { title, body },
      data: {
        title: String(title),
        body: String(body),
        tag: String(tag || 'bluefix'),
        url: './'
      },
      webpush: {
        fcmOptions: { link: './' }
      }
    });

    const deletes = [];
    response.responses.forEach((r, idx) => {
      if (!r.success && (
        r.error?.code === 'messaging/registration-token-not-registered' ||
        r.error?.code === 'messaging/invalid-registration-token'
      )) {
        deletes.push(batch[idx].ref.delete());
      }
    });
    if (deletes.length) await Promise.allSettled(deletes);
  }
}

exports.notifyBluefixSync = onDocumentUpdated('bluefix_sync/{key}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!after) return;

  const key = event.params.key;
  const sender = after.updatedBy || '';
  const beforeArr = Array.isArray(before?.data) ? before.data : [];
  const afterArr = Array.isArray(after?.data) ? after.data : [];

  // Nur echte neue Einträge melden, nicht jede Bearbeitung.
  if (afterArr.length <= beforeArr.length) return;

  const otherName = sender || 'Ein Teammitglied';
  if (key === 'bluefix_team_orders') {
    const neu = afterArr[0];
    const art = neu?.typ === 'kunde' ? 'Kundenauftrag' : 'Teamauftrag';
    await sendPush({
      title: 'BlueFix – Neuer Auftrag',
      body: `${otherName} hat einen ${art} erstellt.`,
      excludeUser: sender,
      tag: 'bluefix-order'
    });
  } else if (key === 'bluefix_team_invoices') {
    await sendPush({
      title: 'BlueFix – Neue Rechnung',
      body: `${otherName} hat eine Rechnung erstellt.`,
      excludeUser: sender,
      tag: 'bluefix-invoice'
    });
  }
});

exports.notifyBluefixChat = onDocumentCreated('bluefix_sync_msgs/{messageId}', async (event) => {
  const msg = event.data?.data();
  if (!msg || !msg.from) return;
  const sender = msg.from;
  const otherName = sender || 'Ein Teammitglied';
  let body = `${otherName} hat im Chat geschrieben.`;
  if (msg.text && typeof msg.text === 'string') {
    const clean = msg.text.replace(/\s+/g, ' ').trim();
    if (clean) body = `${otherName}: ${clean.slice(0, 120)}`;
  }

  await sendPush({
    title: 'BlueFix – Neue Nachricht im Chat',
    body,
    excludeUser: sender,
    tag: 'bluefix-chat'
  });
});
