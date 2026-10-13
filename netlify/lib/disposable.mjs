// Throwaway inbox services blocked at sign-in (keeps "one free scan" honest).
const LIST = `10minutemail.com 10minutemail.net 20minutemail.com 33mail.com anonaddy.me anonbox.net burnermail.io
discard.email discardmail.com dispostable.com dropmail.me emailondeck.com emailfake.com emltmp.com fakeinbox.com fakemail.net
getairmail.com getnada.com nada.email guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz guerrillamail.de
sharklasers.com grr.la pokemail.net spam4.me harakirimail.com inboxkitten.com instantemailaddress.com mail.tm mailcatch.com
maildrop.cc mailinator.com mailinator.net mailinator2.com mailnesia.com mailpoof.com mailsac.com mintemail.com moakt.com
mohmal.com mytemp.email mytrashmail.com nowmymail.com one-time.email rootfest.net spambog.com spambox.us spamgourmet.com
temp-mail.org temp-mail.io tempail.com tempmail.com tempmail.net tempmail.dev tempmailo.com tempmailaddress.com tempinbox.com
tempr.email throwawaymail.com trashmail.com trashmail.de trashmail.net trash-mail.com wegwerfmail.de yopmail.com yopmail.fr
yopmail.net cool.fr.nf jetable.org mailmetrash.com mt2015.com tmail.ws tmpmail.org tmpmail.net tmpeml.com txcct.com vomoto.com
1secmail.com 1secmail.net 1secmail.org esiix.com wwjmp.com xojxe.com yoggm.com emailnax.com linshiyou.com 4wide.fun
mailtemp.uk fexpost.com fexbox.org fextemp.com internxt.com tempm.com mail7.io boun.cr spamdecoy.net deadaddress.com
mailforspam.com spamfree24.org kurzepost.de objectmail.com proxymail.eu rcpt.at trash2009.com wh4f.org zetmail.com
emailtemporanea.net crazymailing.com 0-mail.com mailexpire.com incognitomail.org mailnull.com e4ward.com fakemailgenerator.com
armyspy.com cuvox.de dayrep.com einrot.com fleckens.hu gustr.com jourrapide.com rhyta.com superrito.com teleworm.us`.split(/\s+/);
const SET = new Set(LIST);
export function isDisposable(email) {
  const d = String(email).toLowerCase().split("@")[1] || "";
  if (SET.has(d)) return true;
  return [...SET].some((x) => d.endsWith("." + x));
}
