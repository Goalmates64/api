interface TemplateBase {



  subject: string;



  html: string;



  text: string;



}



export interface EmailVerificationTemplateInput {



  username: string;



  verificationUrl: string;



  expiresAt: Date;



}



export interface NotificationTemplateInput {



  username: string;



  title: string;



  body: string;



  actionUrl?: string | null;



}



export function buildEmailVerificationTemplate(



  input: EmailVerificationTemplateInput,



): TemplateBase {



  const formattedExpiry = formatDate(input.expiresAt);



  const subject = 'Confirme ton adresse email GoalMates';



  const safeName = escapeHtml(input.username || 'GoalMate');



  const html = renderLayout({



    title: 'Bienvenue dans GoalMates !',



    paragraphs: [



      `Salut <strong>${safeName}</strong>, merci de t'être inscrit sur GoalMates.`,



      'Clique sur le bouton ci-dessous pour vérifier ton adresse email et activer ton compte.',



      `Ce lien expire le <strong>${escapeHtml(formattedExpiry)}</strong>. Si tu n'es pas à l'origine de cette inscription, tu peux ignorer cet email.`,



    ],



    action: {



      label: 'Vérifier mon email',



      url: input.verificationUrl,



    },



    footer: 'À très vite sur le terrain ! ⚽',



  });



  const text = [



    `Salut ${input.username || 'GoalMate'},`,



    '',



    "Merci de t'être inscrit·e sur GoalMates. Vérifie ton email avec le lien suivant :",



    input.verificationUrl,



    '',



    `Ce lien expire le ${formattedExpiry}. Si tu n'es pas à l'origine de cette demande, ignore ce message.`,



  ].join('\n');



  return { subject, html, text };



}



export interface PasswordResetTemplateInput {



  username: string;



  resetUrl: string;



  expiresAt: Date;



}



export function buildPasswordResetTemplate(



  input: PasswordResetTemplateInput,



): TemplateBase {



  const formattedExpiry = formatDate(input.expiresAt);



  const subject = 'Reinitialise ton mot de passe GoalMates';



  const safeName = escapeHtml(input.username || 'GoalMate');



  const html = renderLayout({



    title: "Besoin d'un nouveau mot de passe ?",



    paragraphs: [



      `Salut <strong>${safeName}</strong>, nous avons recu une demande pour reinitialiser ton mot de passe GoalMates.`,



      "Clique sur le bouton ci-dessous pour definir un nouveau mot de passe securise.",



      `Ce lien expirera le <strong>${escapeHtml(formattedExpiry)}</strong>. Si tu n'es pas a l'origine de cette demande, ignore cet email.`,



    ],



    action: {



      label: 'Reinitialiser mon mot de passe',



      url: input.resetUrl,



    },



    footer: 'Par securite, le lien expirera automatiquement.',



  });



  const text = [



    `Salut ${input.username || 'GoalMate'},`,



    '',



    'Tu peux redefinir ton mot de passe avec ce lien :',



    input.resetUrl,



    '',



    `Le lien expire le ${formattedExpiry}. Si tu n'es pas concerne, ignore ce message.`,



  ].join('\n');




  return { subject, html, text };



}



export function buildNotificationTemplate(input: NotificationTemplateInput): TemplateBase {



  const subject = `[GoalMates] ${input.title}`;



  const safeBody = escapeHtml(input.body);



  const html = renderLayout({



    title: escapeHtml(input.title),



    paragraphs: [`Salut <strong>${escapeHtml(input.username || 'GoalMate')}</strong>,`, safeBody],



    action: input.actionUrl



      ? {



          label: 'Voir la notification',



          url: input.actionUrl,



        }



      : undefined,



    footer: 'Tu peux gérer tes notifications dans GoalMates.',



  });



  const textParts = [`Salut ${input.username || 'GoalMate'},`, '', input.title, input.body];



  if (input.actionUrl) {



    textParts.push('', `Ouvre GoalMates : ${input.actionUrl}`);



  }



  return { subject, html, text: textParts.join('\n') };



}



const baseFont = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";



function renderLayout(config: {



  title: string;



  paragraphs: string[];



  action?: { label: string; url: string };



  footer?: string;



}): string {



  const paragraphs = config.paragraphs



    .map(



      (paragraph) =>



        `<p style="${baseFont} font-size:16px; line-height:1.6; color:#1f2933; margin:0 0 16px;">${paragraph}</p>`,



    )



    .join('');



  const actionButton = config.action



    ? `<p style="${baseFont} text-align:center; margin:32px 0;"><a href="${config.action.url}" style="${baseFont} background-color:#10b981; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:999px; display:inline-block; font-weight:600;">${escapeHtml(config.action.label)}</a></p>`



    : '';



  const footer = config.footer



    ? `<p style="${baseFont} font-size:14px; line-height:1.6; color:#6b7280; margin:24px 0 0;">${config.footer}</p>`



    : '';



  return `<!DOCTYPE html>



  <html lang="fr">



    <head>



      <meta charset="utf-8" />



      <title>${config.title}</title>



    </head>



    <body style="${baseFont} background-color:#f3f4f6; padding:24px;">



      <div style="max-width:520px; margin:0 auto; background-color:#ffffff; border-radius:16px; padding:32px; box-shadow:0 15px 45px rgba(15,23,42,0.08);">



        <h1 style="${baseFont} font-size:22px; color:#0f172a; margin:0 0 16px;">${config.title}</h1>



        ${paragraphs}



        ${actionButton}



        ${footer}



      </div>



    </body>



  </html>`;



}



function escapeHtml(value: string): string {



  return value



    .replace(/&/g, '&amp;')



    .replace(/</g, '&lt;')



    .replace(/>/g, '&gt;')



    .replace(/"/g, '&quot;')



    .replace(/'/g, '&#39;');



}



const dateFormatter = new Intl.DateTimeFormat('fr-FR', {



  dateStyle: 'full',



  timeStyle: 'short',



});



function formatDate(date: Date): string {



  return dateFormatter.format(date);



}



