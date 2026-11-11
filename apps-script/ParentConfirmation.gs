/**
 * Parent confirmation email and the founder's one-tap WhatsApp reply link.
 *
 * The confirmation is sent at most once for a newly saved booking, after the
 * founder notification. It is best effort: there is no retry queue, and a
 * failure never changes the acknowledgment the parent already received.
 *
 * Every word of the email is fixed in this file. No name, note or other
 * submitted value is placed in it, so the public form cannot be used to send
 * someone else's text to an arbitrary address. The existing new-request
 * budgets in AbuseProtection.gs bound how many can be sent.
 */
const PARENT_CONFIRMATION = {
  // Set to false to stop sending confirmations without changing anything else.
  enabled: true,
  // Leave this much of the daily mail quota for founder notifications and
  // their retries. Below it, the confirmation is recorded as "Not sent".
  minRemainingQuota: 20,
  replyTo: 'hello@tarteelhouse.com',
  senderName: 'Tarteel House',
  whatsappUrl: 'https://wa.me/34614494311',
  checklistUrl: 'https://www.tarteelhouse.com/blog/free-online-quran-trial-lesson-parent-checklist/'
};

// Wording follows docs/commercial-facts.md and the approved /fa/ and /tr/
// pages: a free 40-minute trial, contact normally within two days, no payment.
// Arabic-lesson requests receive the English email; the booking form itself
// is in English.
const PARENT_CONFIRMATION_COPY = {
  english: {
    lang: 'en',
    dir: 'ltr',
    subject: 'We have received your free trial request | Tarteel House',
    heading: 'Your request has been received',
    intro: 'Thank you for requesting a free trial lesson with Tarteel House.',
    stepsHeading: 'What happens next',
    steps: [
      'We read every request personally and match your child with a suitable teacher.',
      'We normally contact families on WhatsApp within two days to agree a day and time.',
      'The trial is a free 40-minute, one-to-one lesson, normally on Zoom or Google Meet. No payment and no commitment.'
    ],
    question: 'A question in the meantime? Reply to this email or message us on WhatsApp:',
    checklist: 'How to prepare for the trial lesson:',
    signoff: 'With warm regards,',
    footer: 'You are receiving this email because a free trial lesson was requested for this address at tarteelhouse.com. If that was not you, please reply to let us know.'
  },
  persian: {
    lang: 'fa',
    dir: 'rtl',
    subject: 'درخواست جلسه آزمایشی رایگان شما را دریافت کردیم | Tarteel House',
    heading: 'درخواست شما به دست ما رسید',
    intro: 'از اینکه برای فرزندتان جلسه آزمایشی رایگان Tarteel House را درخواست کردید، سپاسگزاریم.',
    stepsHeading: 'قدم‌های بعدی',
    steps: [
      'هر درخواست را خودمان می‌خوانیم و معلمی مناسب برای فرزندتان انتخاب می‌کنیم.',
      'برای هماهنگی روز و ساعت، معمولاً ظرف دو روز از طریق واتس‌اپ با شما تماس می‌گیریم.',
      'جلسه آزمایشی رایگان، ۴۰ دقیقه‌ای و یک‌به‌یک است و معمولاً در Zoom یا Google Meet برگزار می‌شود. بدون پرداخت و بدون تعهد.'
    ],
    question: 'اگر در این فاصله پرسشی دارید، به همین ایمیل پاسخ دهید یا در واتس‌اپ به فارسی پیام بدهید:',
    checklist: 'چگونه برای جلسه آزمایشی آماده شویم؟ (به انگلیسی):',
    signoff: 'با احترام،',
    footer: 'این ایمیل را دریافت کرده‌اید چون در tarteelhouse.com برای این نشانی، جلسه آزمایشی رایگان درخواست شده است. اگر این درخواست از طرف شما نبوده، لطفاً با پاسخ به همین ایمیل به ما اطلاع دهید.'
  },
  turkish: {
    lang: 'tr',
    dir: 'ltr',
    subject: 'Ücretsiz deneme dersi talebinizi aldık | Tarteel House',
    heading: 'Talebiniz bize ulaştı',
    intro: 'Tarteel House’tan ücretsiz deneme dersi talep ettiğiniz için teşekkür ederiz.',
    stepsHeading: 'Bundan sonra ne olacak?',
    steps: [
      'Her talebi kendimiz okuyor ve çocuğunuz için uygun bir öğretmen belirliyoruz.',
      'Gün ve saati birlikte belirlemek için genellikle iki gün içinde WhatsApp üzerinden sizinle iletişime geçeriz.',
      'Deneme dersi ücretsiz, 40 dakikalık ve birebirdir; genellikle Zoom veya Google Meet üzerinden yapılır. Ödeme yok, taahhüt yok.'
    ],
    question: 'Bu arada bir sorunuz olursa bu e-postayı yanıtlayabilir veya WhatsApp’tan Türkçe yazabilirsiniz:',
    checklist: 'Deneme dersine nasıl hazırlanılır? (İngilizce):',
    signoff: 'Saygılarımızla,',
    footer: 'Bu e-postayı, tarteelhouse.com üzerinden bu adres için ücretsiz deneme dersi talep edildiği için alıyorsunuz. Talep size ait değilse lütfen bu e-postayı yanıtlayarak bize bildirin.'
  }
};

// The founder's first WhatsApp message, pre-written in the family's language.
// It opens as a draft in WhatsApp and can be edited before sending.
const WHATSAPP_REPLY_COPY = {
  english: 'Hello {parent}, this is Tarteel House. Thank you for requesting a free trial lesson for {child}. Which day and time would suit you this week?',
  persian: 'سلام {parent} عزیز، از Tarteel House پیام می‌دهیم. از درخواست جلسه آزمایشی رایگان برای {child} سپاسگزاریم. این هفته چه روز و ساعتی برای شما مناسب است؟',
  turkish: 'Merhaba {parent}, Tarteel House’tan yazıyoruz. {child} için ücretsiz deneme dersi talebiniz için teşekkür ederiz. Bu hafta hangi gün ve saat sizin için uygun olur?'
};

// Called only while the shared booking script lock is held. Rereads the saved
// row so request values cannot redirect or reword the email.
function attemptParentConfirmation_(sheet, headers, rowNumber) {
  const column = headers.indexOf('parent_confirmation_status') + 1;
  if (!PARENT_CONFIRMATION.enabled || !column) return 'skipped';
  const values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const saved = notificationRecord_(headers, values);
  // Only a new row is Pending. Legacy rows, retries of a settled booking and
  // an interrupted "Sending" are never emailed again.
  if (saved.parent_confirmation_status !== 'Pending') return 'skipped';

  const cell = sheet.getRange(rowNumber, column);
  const email = String(saved.email == null ? '' : saved.email).trim().replace(/^'(?=[=+\-@])/, '');
  let quota = -1;
  try {
    quota = MailApp.getRemainingDailyQuota();
  } catch (quotaError) {
    quota = -1;
  }
  if (!isValidEmail_(email) || typeof quota !== 'number' || !Number.isFinite(quota) ||
      quota < PARENT_CONFIRMATION.minRemainingQuota) {
    cell.setValue('Not sent');
    SpreadsheetApp.flush();
    return 'not_sent';
  }

  // Durable claim before MailApp is called: if anything after this point is
  // uncertain, the row stays "Sending" and is not emailed twice.
  cell.setValue('Sending');
  SpreadsheetApp.flush();
  let failed = false;
  try {
    MailApp.sendEmail(parentConfirmationMessage_(email, saved.session_language));
  } catch (mailError) {
    failed = true;
  }
  cell.setValue(failed ? 'Failed' : 'Sent');
  SpreadsheetApp.flush();
  return failed ? 'failed' : 'sent';
}

function parentConfirmationCopy_(sessionLanguage) {
  const key = String(sessionLanguage == null ? '' : sessionLanguage).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PARENT_CONFIRMATION_COPY, key) ?
    PARENT_CONFIRMATION_COPY[key] : PARENT_CONFIRMATION_COPY.english;
}

function parentConfirmationMessage_(email, sessionLanguage) {
  const copy = parentConfirmationCopy_(sessionLanguage);
  const text = [
    copy.heading,
    '',
    copy.intro,
    '',
    copy.stepsHeading,
    '1. ' + copy.steps[0],
    '2. ' + copy.steps[1],
    '3. ' + copy.steps[2],
    '',
    copy.question,
    PARENT_CONFIRMATION.whatsappUrl,
    '',
    copy.checklist,
    PARENT_CONFIRMATION.checklistUrl,
    '',
    copy.signoff,
    'Tarteel House',
    '',
    copy.footer
  ].join('\n');

  const align = copy.dir === 'rtl' ? 'right' : 'left';
  const body = 'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;' +
    'font-size:16px;line-height:1.65;color:#1a1814;';
  const link = 'color:#1f3a2e;text-decoration:underline;';
  const html =
    '<!doctype html>' +
    '<html lang="' + copy.lang + '" dir="' + copy.dir + '">' +
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f5f1e8;">' +
    '<div style="max-width:34rem;margin:0 auto;padding:32px 24px;text-align:' + align + ';' + body + '">' +
      '<p style="margin:0 0 28px;font-family:Georgia,\'Times New Roman\',serif;font-size:18px;' +
        'letter-spacing:0.02em;color:#1f3a2e;" dir="ltr"><em>Tarteel</em> ' +
        '<span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.28em;">HOUSE</span></p>' +
      '<h1 style="margin:0 0 16px;font-family:Georgia,\'Times New Roman\',serif;font-weight:normal;' +
        'font-size:26px;line-height:1.25;color:#1a1814;">' + escapeHtml_(copy.heading) + '</h1>' +
      '<p style="margin:0 0 24px;">' + escapeHtml_(copy.intro) + '</p>' +
      '<p style="margin:0 0 8px;font-weight:600;color:#7a5a2e;">' + escapeHtml_(copy.stepsHeading) + '</p>' +
      '<ol style="margin:0 0 24px;padding-' + (copy.dir === 'rtl' ? 'right' : 'left') + ':22px;">' +
        copy.steps.map(function (step) {
          return '<li style="margin:0 0 8px;">' + escapeHtml_(step) + '</li>';
        }).join('') +
      '</ol>' +
      '<p style="margin:0 0 16px;">' + escapeHtml_(copy.question) + ' ' +
        '<a style="' + link + '" href="' + escapeHtml_(PARENT_CONFIRMATION.whatsappUrl) + '">WhatsApp</a></p>' +
      '<p style="margin:0 0 28px;">' + escapeHtml_(copy.checklist) + ' ' +
        '<a style="' + link + '" href="' + escapeHtml_(PARENT_CONFIRMATION.checklistUrl) + '" dir="ltr">tarteelhouse.com</a></p>' +
      '<p style="margin:0 0 28px;">' + escapeHtml_(copy.signoff) + '<br>Tarteel House</p>' +
      '<p style="margin:0;padding-top:16px;border-top:1px solid rgba(26,24,20,0.12);font-size:13px;' +
        'line-height:1.55;color:#5c5245;">' + escapeHtml_(copy.footer) + '</p>' +
    '</div></body></html>';

  return {
    to: email,
    subject: copy.subject,
    body: text,
    htmlBody: html,
    replyTo: PARENT_CONFIRMATION.replyTo,
    name: PARENT_CONFIRMATION.senderName
  };
}

// A wa.me link that opens the family's chat with a first message drafted in
// their lesson language. Used only inside the founder's notification email.
function whatsappReplyLink_(saved) {
  const digits = String(saved && saved.whatsapp == null ? '' : saved.whatsapp).replace(/[^0-9]/g, '');
  if (!/^[1-9][0-9]{6,14}$/.test(digits)) return '';
  const key = String(saved.session_language == null ? '' : saved.session_language).trim().toLowerCase();
  const template = Object.prototype.hasOwnProperty.call(WHATSAPP_REPLY_COPY, key) ?
    WHATSAPP_REPLY_COPY[key] : WHATSAPP_REPLY_COPY.english;
  const clean = function (value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  };
  const message = template
    .split('{parent}').join(clean(saved.parent_name))
    .split('{child}').join(clean(saved.child_name));
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
}
