# Vehicle asset revision — 2026-10-19

Only `dist/models.js` changes the product. The V800 gold and design references and the iCAR03T frontal reference in `../references/` were viewed before modeling.

## V800

- Corrected two-tone placement: gold hood, roof and window surround over a black lower body.
- Added a low closed front, central faceted jewel badge, thin eyebrow lights, three vertically stacked corner projectors and a separate narrow lower intake.
- Rebuilt the silhouette with longitudinal sections: 5.495 m body length, 2.006 m body width and 1.85 m roof height. Overall bounds include mirrors, tires and trim.
- Sloped windshield, three long side-window panels, sliding-door rail, paired bright handles, polished sills, dark wheel arches and large disc wheels with batched perimeter vents.

## iCAR 03T

- Red body and black roof, squared high hood, faceted shoulder surfaces and upright cabin.
- Narrow horizontal grille with iCAR mark, segmented I-shaped lamps, corner vents, two projecting bumper guards and inset fog lamps.
- Roof rails, pronounced wheel arches, rocker guards, vertical rear lamps and a square rear storage box.

## Interfaces

- Existing exports are retained.
- MPV and SUV each expose `userData.hazardLights`: six meshes, each with its own amber material. Front corners, rear corners and mirrors are independently accessible. Animate each material's `emissiveIntensity`; initial intensity is zero. White headlights and red rear lamps remain distinct.
- `createSedan({ color, braking = false } = {})` accepts a traffic paint color. `userData.brakeLights` contains three meshes. A sedan owns its brake material, so changing one vehicle does not change another. Initial intensity is 0.35, or 3.6 when braking is true.
- Browser-only canvas badges return early when `document` is unavailable. The models instantiate in Node without a DOM.

## Verification

- `node --check dist/models.js` passed.
- Instantiated all five exported factories in Node. Checked every position and normal for finite values, computed bounds, checked six independent amber materials per obstacle car, and verified sedan color/braking instantiation and brake-material isolation.
- Reduced rounded-detail curve tessellation to three subdivisions. Node geometry counts: MPV 12,852 triangles, SUV 10,544, roadster 3,504, sedan 2,804, battery 308. Canvas badges add two triangles apiece only in the browser.
- Rendered front and rear three-quarter views in headless Chrome/WebGL and inspected the resulting image. Corrected window surfaces that initially sat inside the cabin shell. The final render shows distinct silhouettes, visible side glazing and the requested front/rear identity details.
- Local inspection files: `../vehicle-preview.html`, `../vehicle-preview.png`. These are development evidence, not publication artifacts.

This is a lightweight game interpretation from the supplied reference views, not manufacturer CAD. Scene animation, hazard timing and traffic placement are outside this revision.
