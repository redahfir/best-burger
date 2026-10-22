# Serveur fidélité BEST BURGER

Petit serveur Node.js (sans framework, base SQLite intégrée) qui gère la carte fidélité du site :

- inscription des clients depuis `fidelite.html` ;
- carte Apple Wallet (`.pkpass` signé) et Google Wallet (lien « Ajouter à Google Wallet ») ;
- page `comptoir.html` pour l'équipe : scanner ou saisir le code du client, ajouter un tampon, utiliser une récompense ;
- mise à jour automatique des cartes dans le téléphone à chaque tampon (notification Apple, mise à jour Google).

Le site reste sur GitHub Pages ; ce serveur est hébergé à part, car la signature des cartes
demande des clés secrètes qui ne peuvent pas être dans un site statique.

## Démarrer en local

```sh
cd fidelite-api
npm ci
cp .env.example .env   # puis remplir les valeurs
npm start
npm test               # 14 tests, dont la vérification de la signature Apple avec openssl
```

Node.js 22.13 ou plus récent est nécessaire (module `node:sqlite`).
Sans identifiants Apple ou Google, le serveur fonctionne quand même : le bouton Wallet correspondant est masqué.

## Ce que le client doit fournir

### Apple Wallet

1. **Compte Apple Developer** (99 $ par an) : https://developer.apple.com/programs/
   Pour un compte au nom de la société, Apple demande un numéro D-U-N-S (gratuit).
2. **Pass Type ID** : *Certificates, Identifiers & Profiles* → *Identifiers* → **+** → *Pass Type IDs*,
   par exemple `pass.fr.bestburger.fidelite` → `APPLE_PASS_TYPE_ID`.
3. **Certificat du Pass Type ID** : créer une demande de certificat, l'envoyer à Apple, puis convertir le résultat :
   ```sh
   openssl req -new -newkey rsa:2048 -nodes -keyout certificats/pass.key -out pass.csr -subj "/CN=BEST BURGER"
   # Sur developer.apple.com : Pass Type ID → Create Certificate → envoyer pass.csr → télécharger pass.cer
   openssl x509 -inform DER -in pass.cer -out certificats/pass.pem
   ```
   Ce certificat expire au bout d'un an : penser à le renouveler.
4. **Certificat intermédiaire Apple WWDR G4** : https://www.apple.com/certificateauthority/ (AppleWWDRCAG4.cer)
   ```sh
   openssl x509 -inform DER -in AppleWWDRCAG4.cer -out certificats/wwdr-g4.pem
   ```
5. **Team ID** : visible dans *Membership details* → `APPLE_TEAM_ID`.

### Google Wallet

1. **Console Google Pay & Wallet** (gratuit) : https://pay.google.com/business/console
   → créer le profil de l'entreprise → *Google Wallet API* → noter l'**Issuer ID** → `GOOGLE_ISSUER_ID`.
2. **Projet Google Cloud** : activer l'API *Google Wallet API*, créer un **compte de service**,
   puis une **clé JSON** → `GOOGLE_SERVICE_ACCOUNT`.
3. Dans la console Wallet, *Utilisateurs* : ajouter l'adresse e-mail du compte de service avec l'accès *Développeur*.
4. Tant que Google n'a pas validé le compte (*Request publishing access*), seuls les comptes de test
   ajoutés dans la console peuvent enregistrer la carte. Demander la publication une fois les tests faits.

### Le reste

- `STAFF_SECRET` : le code que l'équipe saisit sur `comptoir.html` (12 caractères minimum).
- `TAMPONS_REQUIS` et `RECOMPENSE` : la règle du programme (par défaut 10 tampons = un menu offert).

## Mettre en ligne

Il faut un hébergement Node.js **en HTTPS** avec un **disque persistant** pour la base SQLite
(Render avec disque, Railway, Fly.io, ou un petit VPS : quelques euros par mois). Un `Dockerfile` est fourni ;
la base est dans `/data` (volume à conserver et à sauvegarder).

Ensuite, sur le site :

1. renseigner l'adresse du serveur dans `js/fidelite.js` (`const API_URL = "https://…";`) ;
2. si le site change d'adresse (nom de domaine), mettre à jour `SITE_URL` et `ALLOWED_ORIGINS`.

Tant que `API_URL` est vide, la page Fidélité affiche « bientôt disponible » et rien n'est envoyé.

## Fonctionnement

| Route | Rôle |
| --- | --- |
| `POST /api/inscription` | Création de la carte (prénom, e-mail, téléphone facultatif, consentement) |
| `GET /api/cartes/:id` | Carte du client (jeton secret obligatoire) |
| `DELETE /api/cartes/:id` | Suppression de la carte et des données (RGPD) |
| `GET /api/cartes/:id/apple?t=…` | Téléchargement du `.pkpass` |
| `GET /api/cartes/:id/google?t=…` | Redirection vers « Ajouter à Google Wallet » |
| `GET /api/comptoir/membres?code=…` ou `?q=…` | Recherche (code comptoir obligatoire) |
| `POST /api/comptoir/membres/:id/tampons` | Ajout de tampons ; chaque carte complète donne une récompense |
| `POST /api/comptoir/membres/:id/recompense` | Utilisation d'une récompense |
| `/apple/v1/…` | Service web Apple Wallet (inscription des iPhone, mises à jour) |
| `GET /visuels/google/:tampons-:total.png` | Bannière de la carte Google Wallet (publique, rien de personnel) |

## Visuel de la carte

La carte affiche un bandeau avec la photo du burger et les tampons du client : `strip.png` dans Apple Wallet,
bannière (`heroImage`) dans Google Wallet, et la même image sur `carte.html`. Le décor et les tampons sont dessinés
une fois pour toutes dans `outils/visuel/modele.html` ; le serveur place ensuite les tampons du client
(`src/visuel.js`, sans bibliothèque d'image) et garde les images en mémoire.

Google télécharge la bannière depuis ce serveur : elle n'apparaît que si `PUBLIC_URL` est une adresse HTTPS
publique (pas pendant un test en réseau local). Pour changer le dessin : modifier `modele.html`, lancer
`node outils/visuel/rendre.mjs` (Playwright requis), puis reporter la zone affichée dans `ZONE_TAMPONS`
de `js/fidelite.js`. Les cartes Google se mettent à jour au tampon suivant.

Sécurité : chaque carte a un jeton secret ; le comptoir est protégé par `STAFF_SECRET` avec blocage après
10 essais erronés ; les inscriptions sont limitées par adresse IP ; seules les origines autorisées peuvent appeler l'API.
Les cartes sans passage depuis trois ans sont supprimées automatiquement.

`npm audit` signale `node-forge` (utilisé pour signer le `.pkpass`) : la faille concerne la *vérification*
de signatures, que ce serveur n'utilise pas.

## À prévoir

- Remplacer les boutons Wallet de `carte.html` par les badges officiels
  ([Apple](https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/),
  [Google](https://developers.google.com/wallet/generic/resources/brand-guidelines)) si Apple ou Google le demandent.
- Le scanner de QR code du comptoir utilise la caméra sur Chrome Android et Edge ; sur iPhone, saisir le code.
