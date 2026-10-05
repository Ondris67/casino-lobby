# Royal Flush Casino

Static browser casino with Slots, Craps, Blackjack, Roulette, custom wagers, and online two-player Blackjack rooms.

## Publish with GitHub Pages

1. Create a GitHub repository and upload the contents of this folder to the repository root. Keep `index.html`, `style.css`, and `script.js` together.
2. In the repository, open **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Choose the `main` branch and `/ (root)`, then save.
5. Wait for GitHub Pages to finish publishing and open the URL shown in **Settings > Pages**.

The site is static and needs no build step. PeerJS is loaded from jsDelivr for online Blackjack, so that multiplayer feature requires an internet connection and the external PeerJS signaling service to be available.

## Play online Blackjack

Both players open the published Pages URL. One selects **Vytvořit online stůl** and shares the six-digit code. The other selects Blackjack, enters the code, and joins.
