# Grains

A crowdsourced platform for discovering film-developing labs and film stocks, plus a minimal photobook-style portfolio for the community.

## Language

**Photo**:
The atomic unit of community-uploaded visual content. Carries metadata (Film Stock, Scanner model, Camera, Chemistry) and can belong to multiple Photobooks at once. Replaces the earlier "Roll" curation-unit concept — see Photobook below.
_Avoid_: Roll (deprecated as a curation-unit term — see below)

**Photobook**:
A thematic, concept-driven collection of Photos curated by a user (e.g. "Bangkok Overcast," "Portra 400 Skin Tones"). Public by default. Can contain a mix of the curator's own Photos and Photos Connected from other users. The unit of curation on a user's portfolio (`/u/@username`).
_Avoid_: Roll, Story, Photo Essay, Series (all retired in favor of this term — see decision log in [docs/prd](docs/prd) for the Are.na-model pivot that replaced "Roll")

**Connection**:
The act of saving/adding another user's public Photo into one's own Photobook, without re-uploading it. Creates the community's interconnected discovery graph (browse a Photobook → click a Photo → see its Film Stock/Scanner metadata).

**Lab Atmosphere Photo**:
A community-uploaded photo of a lab's storefront/interior, attached directly to the Lab. Venue documentation only — carries no judgment about scan quality.
_Avoid_: confusing with Film Sample Photo

**Film Sample Photo**:
A community-uploaded Photo showing what a film stock looks like when processed/scanned, surfaced on that stock's Gallery. Attached only to the Film Stock, never to a Lab, so that a subjectively "bad" scan can't damage a specific lab's reputation. Scanner *model* (e.g. Noritsu, Frontier) may appear as neutral technical metadata on the photo — the same category as Camera — but the specific Lab that processed it is never shown or linkable from the photo.
_Avoid_: Lab photo, sample photo (without specifying it's stock-linked, not lab-linked)

**Landmark note**:
A short, contributor-written line describing what to look for when finding a Lab in person (e.g. "above the 7-Eleven, unmarked door"), attached to the Lab alongside its map pin. Distinct from a formal street address — it captures the "how a person actually finds this place" detail an address doesn't, especially for a Lab down a soi or sharing an entrance with another business. See [docs/prd/lab-directory-discovery.md](docs/prd/lab-directory-discovery.md).
_Avoid_: address, directions (the note is a supplement to the pin/address, not a replacement)

## Retired terms

**Roll** (as curation unit): Originally the unit of curation on a user's portfolio — a fixed grid of photos grouped together, one Lab/Camera/Scanner/Film Stock context per group. Retired in favor of **Photobook** + atomic **Photo**, adopting an Are.na-style model where a Photo is independent and can be curated into many Photobooks rather than belonging to one rigid group. "Roll" may still appear in casual product copy to mean a physical roll of film (the real-world object), but is no longer a data/curation term.
