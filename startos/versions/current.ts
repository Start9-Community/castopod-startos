import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.15.6:1',
  releaseNotes: {
    en_US:
      "New Podcast Index support: Configure Podcast Index stores your API key, Submit to Podcast Index lists a published podcast there and links to the submission pages of Apple Podcasts, Spotify and other directories, and a Podcast Index health check shows whether your podcasts are indexed. New Set Lightning Address action: put a Lightning address in a podcast's feed to receive value-for-value payments from listeners.",
    es_ES:
      'Nueva compatibilidad con Podcast Index: Configurar Podcast Index guarda tu clave de API, Enviar a Podcast Index incluye allí un pódcast publicado y enlaza a las páginas de envío de Apple Podcasts, Spotify y otros directorios, y una comprobación de estado de Podcast Index muestra si tus pódcasts están indexados. Nueva acción Establecer dirección Lightning: añade una dirección Lightning al feed de un pódcast para recibir pagos value-for-value de los oyentes.',
    de_DE:
      'Neu: Podcast-Index-Unterstützung – „Podcast Index konfigurieren“ speichert deinen API-Schlüssel, „An Podcast Index übermitteln“ trägt einen veröffentlichten Podcast dort ein und verlinkt die Einreichungsseiten von Apple Podcasts, Spotify und weiteren Verzeichnissen, und eine Podcast-Index-Statusprüfung zeigt, ob deine Podcasts indexiert sind. Neu: die Aktion „Lightning-Adresse festlegen“ trägt eine Lightning-Adresse in den Feed eines Podcasts ein, um Value-for-Value-Zahlungen von Hörern zu empfangen.',
    pl_PL:
      'Nowa obsługa Podcast Index: Skonfiguruj Podcast Index zapisuje klucz API, Zgłoś do Podcast Index dodaje tam opublikowany podcast i podaje linki do stron zgłoszeń Apple Podcasts, Spotify i innych katalogów, a kontrola stanu Podcast Index pokazuje, czy podcasty są zaindeksowane. Nowa akcja Ustaw adres Lightning: dodaje adres Lightning do kanału podcastu, aby odbierać płatności value-for-value od słuchaczy.',
    fr_FR:
      "Nouvelle prise en charge de Podcast Index : Configurer Podcast Index enregistre votre clé d'API, Soumettre à Podcast Index y référence un podcast publié et renvoie vers les pages de soumission d'Apple Podcasts, de Spotify et d'autres annuaires, et une vérification d'état Podcast Index indique si vos podcasts sont indexés. Nouvelle action Définir l'adresse Lightning : ajoute une adresse Lightning au flux d'un podcast pour recevoir les paiements value-for-value des auditeurs.",
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
