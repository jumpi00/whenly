// Informativa privacy. Testo in italiano e inglese; le altre lingue mostrano l'inglese.
const CONTACT = 'hello@giampaolozirone.com';
const UPDATED = { it: '8 ottobre 2026', en: 'October 8, 2026' };

const TEXT = {
  it: `
    <h1>Informativa privacy</h1>
    <p class="muted">Ultimo aggiornamento: ${UPDATED.it}</p>

    <h2>Chi è il titolare</h2>
    <p>Giampaolo Zirone — <a href="mailto:${CONTACT}">${CONTACT}</a></p>

    <h2>Quali dati raccogliamo</h2>
    <ul>
      <li><b>Chi crea un evento:</b> titolo, giorni, orari, fuso orario e, se li inserisce, una descrizione e i contatti (email, telefono, link) che sceglie di mostrare ai partecipanti.</li>
      <li><b>Chi risponde:</b> il nome scelto, le fasce in cui è disponibile e, se la imposta, una password salvata solo in forma cifrata (non leggibile da nessuno).</li>
      <li><b>Sul tuo dispositivo:</b> lingua, tema, fuso orario preferito e il nome usato per ogni evento, salvati nella memoria del browser (localStorage). Non usiamo cookie di profilazione.</li>
    </ul>

    <h2>Perché</h2>
    <p>Solo per far funzionare il servizio che hai scelto di usare: organizzare un appuntamento (art. 6.1.b GDPR). Nessuna pubblicità, profilazione o statistica.</p>

    <h2>Chi può vedere i dati</h2>
    <p>Chiunque abbia il link di un evento vede titolo, descrizione, contatti dell'organizzatore, nomi e disponibilità dei partecipanti. Condividi il link solo con le persone coinvolte. Le password non sono visibili a nessuno.</p>

    <h2>Per quanto tempo</h2>
    <p>Ogni evento, con tutte le risposte e le password collegate, viene <b>cancellato automaticamente il giorno dopo la sua ultima data</b>.</p>

    <h2>Fornitori tecnici</h2>
    <ul>
      <li><b>Supabase</b> — database in cui sono salvati eventi e risposte.</li>
      <li><b>GitHub Pages</b> — ospita il sito; può registrare l'indirizzo IP per motivi di sicurezza.</li>
      <li><b>Google Fonts</b> e <b>jsDelivr</b> — forniscono il font e una libreria del sito; ricevono l'indirizzo IP del browser.</li>
      <li><b>Formspree</b> — riceve i messaggi inviati con il modulo Feedback (testo ed eventuali nome ed email) e li inoltra al titolare.</li>
    </ul>
    <p>Alcuni fornitori possono trattare dati fuori dall'Unione Europea, con le garanzie previste dal GDPR.</p>

    <h2>I tuoi diritti</h2>
    <p>Puoi chiedere accesso, correzione o cancellazione anticipata dei tuoi dati scrivendo a <a href="mailto:${CONTACT}">${CONTACT}</a>. Hai anche il diritto di presentare reclamo al Garante per la protezione dei dati personali.</p>
  `,
  en: `
    <h1>Privacy notice</h1>
    <p class="muted">Last updated: ${UPDATED.en}</p>

    <h2>Who is responsible</h2>
    <p>Giampaolo Zirone — <a href="mailto:${CONTACT}">${CONTACT}</a></p>

    <h2>What data we collect</h2>
    <ul>
      <li><b>Event organizers:</b> title, days, times, time zone and, if provided, a description and the contacts (email, phone, link) they choose to show to participants.</li>
      <li><b>Participants:</b> the name they choose, the times they are available and, if set, a password stored only in encrypted form (unreadable by anyone).</li>
      <li><b>On your device:</b> language, theme, preferred time zone and the name used for each event, stored in your browser (localStorage). No tracking cookies.</li>
    </ul>

    <h2>Why</h2>
    <p>Only to provide the service you chose to use: scheduling a meeting (Art. 6(1)(b) GDPR). No advertising, profiling or analytics.</p>

    <h2>Who can see the data</h2>
    <p>Anyone with an event link can see its title, description, the organizer's contacts, and the participants' names and availability. Only share the link with the people involved. Passwords are not visible to anyone.</p>

    <h2>How long we keep it</h2>
    <p>Each event, with all its responses and passwords, is <b>deleted automatically the day after its last date</b>.</p>

    <h2>Service providers</h2>
    <ul>
      <li><b>Supabase</b> — database storing events and responses.</li>
      <li><b>GitHub Pages</b> — hosts the website; may log IP addresses for security.</li>
      <li><b>Google Fonts</b> and <b>jsDelivr</b> — serve the font and a library used by the site; they receive your browser's IP address.</li>
      <li><b>Formspree</b> — receives messages sent through the Feedback form (the text and, if given, name and email) and forwards them to the owner.</li>
    </ul>
    <p>Some providers may process data outside the European Union, with the safeguards required by the GDPR.</p>

    <h2>Your rights</h2>
    <p>You can request access to, correction or early deletion of your data by writing to <a href="mailto:${CONTACT}">${CONTACT}</a>. You also have the right to lodge a complaint with your data protection authority.</p>
  `,
};

export const privacyHTML = lang => TEXT[lang] ?? TEXT.en;
