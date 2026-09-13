# usufruct

The user-supplied [HTML reference](docs/design/reference/usufruct-ui.html), adopted 13 September 2026, is the primary visual and interaction reference. It supersedes the earlier orchard-on-paper direction. Match its composition, typography, colour, graphic furniture and responsive layouts closely. Its simulated transactions and financial numbers are not implementation requirements. Economic authority remains `feestrip-handoff/PRODUCT_CONTRACT.md`.

## Identity and composition

Lowercase **usufruct**. The new identity uses large condensed headlines, monospaced records, flat blue bands, citrus stencils, irregular barcodes, dither textures and small window controls. The landing page combines an open hero field, an oversized statement, a bright blue band, a numbered process and a direct call to action. Market rows, listing details, the pin workflow and holdings share the same window frame and exact information hierarchy.

Use the reference's dark and light themes, square corners, thin rules, restrained spacing and compact telemetry labels. Avoid adding rounded dashboard cards, floating shadows or unrelated illustrations. Graphic textures never obscure financial amounts or controls. Match the reference's decorative graphics directly when possible, using code-native SVG, CSS and canvas.

## Typography and assets

- **Anton**, weight 400, for display headings and oversized statements. Do not synthesize bold or italics.
- **Space Mono**, regular, bold and italic, for prose, navigation, controls and financial records.
- Self-host the licensed WOFF2 fonts, preload the two main faces, and use `font-display: swap`. Font sources, hashes and licences are recorded in [reference provenance](docs/design/reference/README.md).
- Original Instrument Serif/Courier Prime assets remain historical brand resources; they are not the active application typography.

## Real interactions

**Market** separates signed seller advertisements from activated fee claims. An advertisement is not an escrowed NFT, an issued claim or a completed sale. Show exact share, asking USDC, endpoint, deadline and availability; uncertain fee income may be zero.

**Pin a seed** selects an eligible NFT, publishes signed terms, then reviews buyer-funded offers. Publishing is gasless and leaves the NFT with its owner. Approval and acceptance remain separate onchain actions. Acceptance pays the seller, freezes the original position and starts the earning window. Disabled actions explain the actual prerequisite next to the control.

**Holdings** covers fee claims, original NFT return rights, buyer-funded offers and maker inventory. Preserve actionable settlement states: endpoint, late capture, NFT return, proof allocation and redemption are distinct. Never display a simulated daily yield or balance as real data.

## Accessibility and truthfulness

Use semantic controls, keyboard-visible focus, labelled inputs, sufficient contrast and comfortable touch targets. Mobile records must retain price, exact quantities, endpoint and actions without horizontal page scrolling. Support reduced motion; all content must remain usable if WebGL or animation is unavailable. Theme preference is persistent.

Reference metaphor is welcome around the product explanation. Before signing, precise terms govern: fractional claims to one fixed window's native USDC fees, fixed original Q, income following current claims, and no guaranteed return. A disconnected wallet, fixture example, unavailable service and empty real market must be clearly distinguishable. Never change deployed contract identifiers or typed-data domains to match branding.
