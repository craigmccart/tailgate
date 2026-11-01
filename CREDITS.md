# Credits

Every third-party asset in this repo gets a line here in the same commit that adds it.
Treat this file as an SBOM for assets. An asset with no entry here is a bug.

Format: `filename | source URL | author | licence`

## Art

All third-party art below is from Kenney (kenney.nl), released under CC0 1.0 (public
domain). Attribution is not required by the licence, but is recorded here as an asset
SBOM. Each file is a single tile or sprite extracted from a Kenney pack and renamed;
the original pack tile index or filename is noted for provenance. The one exception is
the CCTV camera prop, which this project builds itself; it has its own section below.

### Environment tiles, from Kenney "Roguelike Modern City"

Pack: https://kenney.nl/assets/roguelike-modern-city | Kenney | CC0 1.0
16x16 pixel tiles. Tile index = row * 37 + col in the pack's tilemap.

- public/assets/tiles/floor_carpet.png | pack tile_0706 | Kenney | CC0 1.0
- public/assets/tiles/floor_tile.png | pack tile_0703 | Kenney | CC0 1.0
- public/assets/tiles/floor_tile_cool.png | pack tile_0709 | Kenney | CC0 1.0
- public/assets/tiles/floor_concrete.png | pack tile_0713 | Kenney | CC0 1.0
- public/assets/tiles/wall_brick.png | pack tile_0074 | Kenney | CC0 1.0
- public/assets/tiles/prop_desk.png | pack tile_0570 | Kenney | CC0 1.0
- public/assets/tiles/prop_desk_small.png | pack tile_0609 | Kenney | CC0 1.0
- public/assets/tiles/prop_cabinet.png | pack tile_0675 | Kenney | CC0 1.0
- public/assets/tiles/prop_counter.png | pack tile_0676 | Kenney | CC0 1.0
- public/assets/tiles/prop_counter_alt.png | pack tile_0677 | Kenney | CC0 1.0
- public/assets/tiles/prop_shelf.png | pack tile_0217 | Kenney | CC0 1.0
- public/assets/tiles/prop_shelf_alt.png | pack tile_0254 | Kenney | CC0 1.0
- public/assets/tiles/prop_crate.png | pack tile_0538 | Kenney | CC0 1.0
- public/assets/tiles/prop_bin.png | pack tile_0497 | Kenney | CC0 1.0
- public/assets/tiles/prop_server.png | pack tile_0321 | Kenney | CC0 1.0
- public/assets/tiles/prop_server_alt.png | pack tile_0322 | Kenney | CC0 1.0
- public/assets/tiles/prop_fence.png | pack tile_0644 | Kenney | CC0 1.0

### Phase 18 venue materials and dressing

- public/assets/environment/wall_office.png | Top-down Shooter, PNG/Tiles/tile_12.png | https://kenney.nl/assets/top-down-shooter | Kenney | CC0 1.0
- public/assets/environment/wall_data_panel.png | Platformer Pack Industrial, PNG/Default size/platformIndustrial_045.png | https://kenney.nl/assets/platformer-pack-industrial | Kenney | CC0 1.0
- public/assets/environment/wall_warehouse_block.png | Platformer Pack Industrial, PNG/Default size/platformIndustrial_057.png | https://kenney.nl/assets/platformer-pack-industrial | Kenney | CC0 1.0
- public/assets/environment/chair.png | Top-down Shooter, PNG/Tiles/tile_528.png | https://kenney.nl/assets/top-down-shooter | Kenney | CC0 1.0
- public/assets/environment/monitor.png | Platformer Pack Industrial, PNG/Default size/platformIndustrial_031.png | https://kenney.nl/assets/platformer-pack-industrial | Kenney | CC0 1.0
- public/assets/environment/copier.png | Platformer Pack Industrial, PNG/Default size/platformIndustrial_046.png | https://kenney.nl/assets/platformer-pack-industrial | Kenney | CC0 1.0
- public/assets/environment/bollard.png | Platformer Pack Industrial, PNG/Default size/platformIndustrial_041.png | https://kenney.nl/assets/platformer-pack-industrial | Kenney | CC0 1.0
- public/assets/environment/kerb.png | Top-down Shooter, PNG/Tiles/tile_520.png | https://kenney.nl/assets/top-down-shooter | Kenney | CC0 1.0
- public/assets/environment/drain.png | Top-down Shooter, PNG/Tiles/tile_269.png | https://kenney.nl/assets/top-down-shooter | Kenney | CC0 1.0
- public/assets/environment/barrier.png | Platformer Pack Industrial, PNG/Default size/platformIndustrial_064.png | https://kenney.nl/assets/platformer-pack-industrial | Kenney | CC0 1.0
- public/assets/environment/vent.png | Platformer Pack Industrial, PNG/Default size/platformIndustrial_035.png | https://kenney.nl/assets/platformer-pack-industrial | Kenney | CC0 1.0
- public/assets/environment/cable_channel.png | Top-down Shooter, PNG/Tiles/tile_514.png | https://kenney.nl/assets/top-down-shooter | Kenney | CC0 1.0
- public/assets/environment/rack_endcap.png | Platformer Pack Industrial, PNG/Default size/platformIndustrial_074.png | https://kenney.nl/assets/platformer-pack-industrial | Kenney | CC0 1.0
- public/assets/environment/pallet_alt.png | Top-down Shooter, PNG/Tiles/tile_453.png | https://kenney.nl/assets/top-down-shooter | Kenney | CC0 1.0
- public/assets/environment/trolley.png | Roguelike Indoors, Tilesheets/roguelikeIndoor_transparent.png, tile t264 (row 9, column 21) | https://kenney.nl/assets/roguelike-indoors | Kenney | CC0 1.0
- public/assets/environment/dock_buffer.png | Top-down Shooter, PNG/Tiles/tile_501.png | https://kenney.nl/assets/top-down-shooter | Kenney | CC0 1.0
- public/assets/environment/sign_panel.png | Platformer Pack Industrial, PNG/Default size/platformIndustrial_082.png | https://kenney.nl/assets/platformer-pack-industrial | Kenney | CC0 1.0
- public/assets/environment/fire_exit.png | Platformer Pack Industrial, PNG/Default size/platformIndustrial_084.png | https://kenney.nl/assets/platformer-pack-industrial | Kenney | CC0 1.0

### Phase 20 CCTV camera prop, original work

Not a third-party asset. Both files are modelled and rendered from scratch by a script
in this repo, so the art rebuilds from source and no .blend binary is the source of
truth. Rebuild them with:

    "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python tools/blender/build_camera_sprite.py

- public/assets/environment/cctv_camera.png | generated by tools/blender/build_camera_sprite.py (Blender, procedural model, orthographic top-down render) | CJM Labs | CC0 1.0
- public/assets/environment/cctv_camera_lens.png | generated by tools/blender/build_camera_sprite.py (Blender, procedural model, orthographic top-down render) | CJM Labs | CC0 1.0

### Player character, from Kenney "Top-down Shooter"

Pack: https://kenney.nl/assets/top-down-shooter | Kenney | CC0 1.0

- public/assets/characters/player_hold.png | pack PNG/Hitman 1/hitman1_hold.png | Kenney | CC0 1.0
- public/assets/characters/player_stand.png | pack PNG/Hitman 1/hitman1_stand.png | Kenney | CC0 1.0
- public/assets/characters/guard.png | pack PNG/Soldier 1/soldier1_stand.png | Kenney | CC0 1.0
- public/assets/characters/staff_a.png | pack PNG/Man Blue/manBlue_stand.png | Kenney | CC0 1.0
- public/assets/characters/staff_b.png | pack PNG/Woman Green/womanGreen_stand.png | Kenney | CC0 1.0

<!-- rendered-assets:start -->

### Phase 24 rendered world, from tools/render

Every file in public/assets/rendered/ is produced by the Blender pipeline in
tools/render/ (see tools/render/README.md) from the CC0 sources below, and is
listed in public/assets/rendered/manifest.json with its full provenance. Each
asset ships as a colour PNG and a `_n.png` normal map; both come from the same
source, so one line covers the pair. This block is generated by
tools/render/update_credits.py, so edit the manifest or sources.json, not this text.

Source packs:

- Furniture Kit | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- Factory Kit | https://kenney.nl/assets/factory-kit | Kenney | CC0 1.0
- City Kit (Industrial) | https://kenney.nl/assets/city-kit-industrial | Kenney | CC0 1.0
- City Kit (Roads) | https://kenney.nl/assets/city-kit-roads | Kenney | CC0 1.0
- Car Kit | https://kenney.nl/assets/car-kit | Kenney | CC0 1.0
- Mini Market | https://kenney.nl/assets/mini-market | Kenney | CC0 1.0
- Animated Characters Protagonists | https://kenney.nl/assets/animated-characters-1 | Kenney | CC0 1.0
- Animated Characters Survivors | https://kenney.nl/assets/animated-characters-2 | Kenney | CC0 1.0
- Animated Characters Retro | https://kenney.nl/assets/animated-characters-3 | Kenney | CC0 1.0
- ambientCG Carpet012 | https://ambientcg.com/view?id=Carpet012 | ambientCG (Lennart Demes) | CC0 1.0
- ambientCG Carpet001 | https://ambientcg.com/view?id=Carpet001 | ambientCG (Lennart Demes) | CC0 1.0
- ambientCG Tiles141 | https://ambientcg.com/view?id=Tiles141 | ambientCG (Lennart Demes) | CC0 1.0
- ambientCG Tiles040 | https://ambientcg.com/view?id=Tiles040 | ambientCG (Lennart Demes) | CC0 1.0
- ambientCG Concrete034 | https://ambientcg.com/view?id=Concrete034 | ambientCG (Lennart Demes) | CC0 1.0
- ambientCG Concrete031 | https://ambientcg.com/view?id=Concrete031 | ambientCG (Lennart Demes) | CC0 1.0
- ambientCG Asphalt033 | https://ambientcg.com/view?id=Asphalt033 | ambientCG (Lennart Demes) | CC0 1.0
- ambientCG Road013A | https://ambientcg.com/view?id=Road013A | ambientCG (Lennart Demes) | CC0 1.0
- ambientCG Metal009 | https://ambientcg.com/view?id=Metal009 | ambientCG (Lennart Demes) | CC0 1.0
- ambientCG Metal032 | https://ambientcg.com/view?id=Metal032 | ambientCG (Lennart Demes) | CC0 1.0
- ambientCG PaintedPlaster017 | https://ambientcg.com/view?id=PaintedPlaster017 | ambientCG (Lennart Demes) | CC0 1.0
- ambientCG Bricks088 | https://ambientcg.com/view?id=Bricks088 | ambientCG (Lennart Demes) | CC0 1.0

Rendered files:

- public/assets/rendered/characters/guard_idle.png (+ normal map) | Animated Characters Retro, Model/characterMedium.fbx + Animations/idle.fbx + Skins/humanMaleA.png | https://kenney.nl/assets/animated-characters-3 | Kenney | CC0 1.0
- public/assets/rendered/characters/guard_walk.png (+ normal map) | Animated Characters Retro, Model/characterMedium.fbx + Animations/run.fbx + Skins/humanMaleA.png | https://kenney.nl/assets/animated-characters-3 | Kenney | CC0 1.0
- public/assets/rendered/characters/staff_a_idle.png (+ normal map) | Animated Characters Retro, Model/characterMedium.fbx + Animations/idle.fbx + Skins/humanFemaleA.png | https://kenney.nl/assets/animated-characters-3 | Kenney | CC0 1.0
- public/assets/rendered/characters/staff_a_walk.png (+ normal map) | Animated Characters Retro, Model/characterMedium.fbx + Animations/run.fbx + Skins/humanFemaleA.png | https://kenney.nl/assets/animated-characters-3 | Kenney | CC0 1.0
- public/assets/rendered/characters/staff_b_idle.png (+ normal map) | Animated Characters Retro, Model/characterMedium.fbx + Animations/idle.fbx + Skins/humanMaleA.png | https://kenney.nl/assets/animated-characters-3 | Kenney | CC0 1.0
- public/assets/rendered/characters/staff_b_walk.png (+ normal map) | Animated Characters Retro, Model/characterMedium.fbx + Animations/run.fbx + Skins/humanMaleA.png | https://kenney.nl/assets/animated-characters-3 | Kenney | CC0 1.0
- public/assets/rendered/characters/worker_hivis_idle.png (+ normal map) | Animated Characters Retro, Model/characterMedium.fbx + Animations/idle.fbx + Skins/humanMaleA.png | https://kenney.nl/assets/animated-characters-3 | Kenney | CC0 1.0
- public/assets/rendered/characters/worker_hivis_walk.png (+ normal map) | Animated Characters Retro, Model/characterMedium.fbx + Animations/run.fbx + Skins/humanMaleA.png | https://kenney.nl/assets/animated-characters-3 | Kenney | CC0 1.0
- public/assets/rendered/floors/floor_carpet.png (+ normal map) | ambientCG, Carpet012 | https://ambientcg.com/view?id=Carpet012 | ambientCG (Lennart Demes) | CC0 1.0
- public/assets/rendered/floors/floor_concrete.png (+ normal map) | ambientCG, Concrete031 | https://ambientcg.com/view?id=Concrete031 | ambientCG (Lennart Demes) | CC0 1.0
- public/assets/rendered/floors/floor_raised.png (+ normal map) | ambientCG, Tiles040 | https://ambientcg.com/view?id=Tiles040 | ambientCG (Lennart Demes) | CC0 1.0
- public/assets/rendered/floors/floor_tarmac.png (+ normal map) | ambientCG, Asphalt033 | https://ambientcg.com/view?id=Asphalt033 | ambientCG (Lennart Demes) | CC0 1.0
- public/assets/rendered/floors/floor_tile.png (+ normal map) | ambientCG, Tiles141 | https://ambientcg.com/view?id=Tiles141 | ambientCG (Lennart Demes) | CC0 1.0
- public/assets/rendered/props/barrier.png (+ normal map) | City Kit (Roads), Models/GLB format/construction-barrier.glb | https://kenney.nl/assets/city-kit-roads | Kenney | CC0 1.0
- public/assets/rendered/props/bin.png (+ normal map) | Furniture Kit, Models/GLTF format/trashcan.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/bollard.png (+ normal map) | Tailgate (original, built from primitives by tools/render), bollard modelled from primitives in tools/render/tailgate_render/primitives.py | https://github.com/craigmccart/tailgate | CJM Labs | CC0 1.0
- public/assets/rendered/props/bookcase.png (+ normal map) | Furniture Kit, Models/GLTF format/bookcaseClosedWide.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/books.png (+ normal map) | Furniture Kit, Models/GLTF format/books.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/box_closed.png (+ normal map) | Furniture Kit, Models/GLTF format/cardboardBoxClosed.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/box_open.png (+ normal map) | Furniture Kit, Models/GLTF format/cardboardBoxOpen.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/cabinet.png (+ normal map) | Furniture Kit, Models/GLTF format/cabinetTelevisionDoors.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/car_hatchback.png (+ normal map) | Car Kit, Models/GLB format/hatchback-sports.glb | https://kenney.nl/assets/car-kit | Kenney | CC0 1.0
- public/assets/rendered/props/car_sedan.png (+ normal map) | Car Kit, Models/GLB format/sedan.glb | https://kenney.nl/assets/car-kit | Kenney | CC0 1.0
- public/assets/rendered/props/car_suv.png (+ normal map) | Car Kit, Models/GLB format/suv.glb | https://kenney.nl/assets/car-kit | Kenney | CC0 1.0
- public/assets/rendered/props/chair.png (+ normal map) | Furniture Kit, Models/GLTF format/chair.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/chair_desk.png (+ normal map) | Furniture Kit, Models/GLTF format/chairDesk.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/coat_rack.png (+ normal map) | Furniture Kit, Models/GLTF format/coatRackStanding.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/coffee_machine.png (+ normal map) | Furniture Kit, Models/GLTF format/kitchenCoffeeMachine.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/coffee_table.png (+ normal map) | Furniture Kit, Models/GLTF format/tableCoffee.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/cone.png (+ normal map) | Factory Kit, Models/GLB format/cone.glb | https://kenney.nl/assets/factory-kit | Kenney | CC0 1.0
- public/assets/rendered/props/cone_road.png (+ normal map) | City Kit (Roads), Models/GLB format/construction-cone.glb | https://kenney.nl/assets/city-kit-roads | Kenney | CC0 1.0
- public/assets/rendered/props/container.png (+ normal map) | City Kit (Industrial), Models/GLB format/shipping-container-a.glb | https://kenney.nl/assets/city-kit-industrial | Kenney | CC0 1.0
- public/assets/rendered/props/conveyor.png (+ normal map) | Factory Kit, Models/GLB format/conveyor-long.glb | https://kenney.nl/assets/factory-kit | Kenney | CC0 1.0
- public/assets/rendered/props/copier.png (+ normal map) | Tailgate (original, built from primitives by tools/render), copier modelled from primitives in tools/render/tailgate_render/primitives.py | https://github.com/craigmccart/tailgate | CJM Labs | CC0 1.0
- public/assets/rendered/props/counter.png (+ normal map) | Furniture Kit, Models/GLTF format/kitchenCabinet.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/counter_sink.png (+ normal map) | Furniture Kit, Models/GLTF format/kitchenSink.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/crate.png (+ normal map) | Factory Kit, Models/GLB format/box-large.glb | https://kenney.nl/assets/factory-kit | Kenney | CC0 1.0
- public/assets/rendered/props/crate_long.png (+ normal map) | Factory Kit, Models/GLB format/box-long.glb | https://kenney.nl/assets/factory-kit | Kenney | CC0 1.0
- public/assets/rendered/props/crate_small.png (+ normal map) | Factory Kit, Models/GLB format/box-small.glb | https://kenney.nl/assets/factory-kit | Kenney | CC0 1.0
- public/assets/rendered/props/desk.png (+ normal map) | Furniture Kit, Models/GLTF format/desk.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/desk_corner.png (+ normal map) | Furniture Kit, Models/GLTF format/deskCorner.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/desk_lamp.png (+ normal map) | Furniture Kit, Models/GLTF format/lampSquareTable.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/desk_small.png (+ normal map) | Furniture Kit, Models/GLTF format/table.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/dock_leveller.png (+ normal map) | Tailgate (original, built from primitives by tools/render), dock_leveller modelled from primitives in tools/render/tailgate_render/primitives.py | https://github.com/craigmccart/tailgate | CJM Labs | CC0 1.0
- public/assets/rendered/props/dumpster.png (+ normal map) | City Kit (Roads), Models/GLB format/dumpster.glb | https://kenney.nl/assets/city-kit-roads | Kenney | CC0 1.0
- public/assets/rendered/props/freezer.png (+ normal map) | Mini Market, Models/GLB format/freezer.glb | https://kenney.nl/assets/mini-market | Kenney | CC0 1.0
- public/assets/rendered/props/fridge.png (+ normal map) | Furniture Kit, Models/GLTF format/kitchenFridge.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/hopper.png (+ normal map) | Factory Kit, Models/GLB format/hopper-square.glb | https://kenney.nl/assets/factory-kit | Kenney | CC0 1.0
- public/assets/rendered/props/keyboard.png (+ normal map) | Furniture Kit, Models/GLTF format/computerKeyboard.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/lamp_post.png (+ normal map) | City Kit (Roads), Models/GLB format/light-square.glb | https://kenney.nl/assets/city-kit-roads | Kenney | CC0 1.0
- public/assets/rendered/props/laptop.png (+ normal map) | Furniture Kit, Models/GLTF format/laptop.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/machine.png (+ normal map) | Factory Kit, Models/GLB format/machine.glb | https://kenney.nl/assets/factory-kit | Kenney | CC0 1.0
- public/assets/rendered/props/monitor.png (+ normal map) | Furniture Kit, Models/GLTF format/computerScreen.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/palisade_fence.png (+ normal map) | Tailgate (original, built from primitives by tools/render), palisade_fence modelled from primitives in tools/render/tailgate_render/primitives.py | https://github.com/craigmccart/tailgate | CJM Labs | CC0 1.0
- public/assets/rendered/props/plant.png (+ normal map) | Furniture Kit, Models/GLTF format/pottedPlant.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/plant_small.png (+ normal map) | Furniture Kit, Models/GLTF format/plantSmall2.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/reception_desk.png (+ normal map) | Tailgate (original, built from primitives by tools/render), reception_desk modelled from primitives in tools/render/tailgate_render/primitives.py | https://github.com/craigmccart/tailgate | CJM Labs | CC0 1.0
- public/assets/rendered/props/roller_shutter.png (+ normal map) | Tailgate (original, built from primitives by tools/render), roller_shutter modelled from primitives in tools/render/tailgate_render/primitives.py | https://github.com/craigmccart/tailgate | CJM Labs | CC0 1.0
- public/assets/rendered/props/server_rack.png (+ normal map) | Tailgate (original, built from primitives by tools/render), server_rack modelled from primitives in tools/render/tailgate_render/primitives.py | https://github.com/craigmccart/tailgate | CJM Labs | CC0 1.0
- public/assets/rendered/props/server_rack_alt.png (+ normal map) | Tailgate (original, built from primitives by tools/render), server_rack_alt modelled from primitives in tools/render/tailgate_render/primitives.py | https://github.com/craigmccart/tailgate | CJM Labs | CC0 1.0
- public/assets/rendered/props/shelf.png (+ normal map) | Mini Market, Models/GLB format/shelf-boxes.glb | https://kenney.nl/assets/mini-market | Kenney | CC0 1.0
- public/assets/rendered/props/shelf_alt.png (+ normal map) | Mini Market, Models/GLB format/shelf-bags.glb | https://kenney.nl/assets/mini-market | Kenney | CC0 1.0
- public/assets/rendered/props/shelf_end.png (+ normal map) | Mini Market, Models/GLB format/shelf-end.glb | https://kenney.nl/assets/mini-market | Kenney | CC0 1.0
- public/assets/rendered/props/skip.png (+ normal map) | Tailgate (original, built from primitives by tools/render), skip modelled from primitives in tools/render/tailgate_render/primitives.py | https://github.com/craigmccart/tailgate | CJM Labs | CC0 1.0
- public/assets/rendered/props/sofa.png (+ normal map) | Furniture Kit, Models/GLTF format/loungeSofa.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/table_round.png (+ normal map) | Furniture Kit, Models/GLTF format/tableRound.glb | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0
- public/assets/rendered/props/tank.png (+ normal map) | City Kit (Industrial), Models/GLB format/detail-tank.glb | https://kenney.nl/assets/city-kit-industrial | Kenney | CC0 1.0
- public/assets/rendered/props/trolley.png (+ normal map) | Mini Market, Models/GLB format/shopping-cart.glb | https://kenney.nl/assets/mini-market | Kenney | CC0 1.0
- public/assets/rendered/props/van.png (+ normal map) | Car Kit, Models/GLB format/van.glb | https://kenney.nl/assets/car-kit | Kenney | CC0 1.0
- public/assets/rendered/props/van_delivery.png (+ normal map) | Car Kit, Models/GLB format/delivery.glb | https://kenney.nl/assets/car-kit | Kenney | CC0 1.0
- public/assets/rendered/props/warning_sign.png (+ normal map) | Factory Kit, Models/GLB format/warning-orange.glb | https://kenney.nl/assets/factory-kit | Kenney | CC0 1.0
- public/assets/rendered/walls/wall_data_hall_panel_side.png (+ normal map) | ambientCG, Metal032 | https://ambientcg.com/view?id=Metal032 | ambientCG (Lennart Demes) | CC0 1.0
- public/assets/rendered/walls/wall_data_hall_panel_top.png (+ normal map) | ambientCG, Metal032 | https://ambientcg.com/view?id=Metal032 | ambientCG (Lennart Demes) | CC0 1.0
- public/assets/rendered/walls/wall_glass_partition_side.png (+ normal map) | Tailgate (original, built from primitives by tools/render), procedural glass partition | https://github.com/craigmccart/tailgate | CJM Labs | CC0 1.0
- public/assets/rendered/walls/wall_glass_partition_top.png (+ normal map) | Tailgate (original, built from primitives by tools/render), procedural glass partition | https://github.com/craigmccart/tailgate | CJM Labs | CC0 1.0
- public/assets/rendered/walls/wall_office_plaster_side.png (+ normal map) | ambientCG, PaintedPlaster017 | https://ambientcg.com/view?id=PaintedPlaster017 | ambientCG (Lennart Demes) | CC0 1.0
- public/assets/rendered/walls/wall_office_plaster_top.png (+ normal map) | ambientCG, PaintedPlaster017 | https://ambientcg.com/view?id=PaintedPlaster017 | ambientCG (Lennart Demes) | CC0 1.0
- public/assets/rendered/walls/wall_warehouse_block_side.png (+ normal map) | ambientCG, Bricks088 | https://ambientcg.com/view?id=Bricks088 | ambientCG (Lennart Demes) | CC0 1.0
- public/assets/rendered/walls/wall_warehouse_block_top.png (+ normal map) | ambientCG, Bricks088 | https://ambientcg.com/view?id=Bricks088 | ambientCG (Lennart Demes) | CC0 1.0

<!-- rendered-assets:end -->

## Audio

Security cues, tension and venue atmosphere are synthesised at runtime with the Web
Audio API. Interaction foley and footsteps use the Kenney CC0 files listed below.

- Radio chatter, zone ambience beds, security stingers and tension bed | generated in src/audio/ (Web Audio synthesis) | CJM Labs | CC0 1.0

### Kenney RPG Audio

- public/assets/audio/footstep-carpet-1.ogg | https://kenney.nl/assets/rpg-audio (cloth1.ogg) | Kenney | CC0 1.0
- public/assets/audio/footstep-carpet-2.ogg | https://kenney.nl/assets/rpg-audio (cloth2.ogg) | Kenney | CC0 1.0
- public/assets/audio/footstep-carpet-3.ogg | https://kenney.nl/assets/rpg-audio (cloth3.ogg) | Kenney | CC0 1.0
- public/assets/audio/footstep-carpet-4.ogg | https://kenney.nl/assets/rpg-audio (cloth4.ogg) | Kenney | CC0 1.0
- public/assets/audio/footstep-tile-1.ogg | https://kenney.nl/assets/rpg-audio (footstep00.ogg) | Kenney | CC0 1.0
- public/assets/audio/footstep-tile-2.ogg | https://kenney.nl/assets/rpg-audio (footstep01.ogg) | Kenney | CC0 1.0
- public/assets/audio/footstep-tile-3.ogg | https://kenney.nl/assets/rpg-audio (footstep02.ogg) | Kenney | CC0 1.0
- public/assets/audio/footstep-tile-4.ogg | https://kenney.nl/assets/rpg-audio (footstep03.ogg) | Kenney | CC0 1.0
- public/assets/audio/footstep-concrete-1.ogg | https://kenney.nl/assets/rpg-audio (footstep04.ogg) | Kenney | CC0 1.0
- public/assets/audio/footstep-concrete-2.ogg | https://kenney.nl/assets/rpg-audio (footstep05.ogg) | Kenney | CC0 1.0
- public/assets/audio/footstep-concrete-3.ogg | https://kenney.nl/assets/rpg-audio (footstep06.ogg) | Kenney | CC0 1.0
- public/assets/audio/footstep-concrete-4.ogg | https://kenney.nl/assets/rpg-audio (footstep07.ogg) | Kenney | CC0 1.0
- public/assets/audio/bolt-throw.ogg | https://kenney.nl/assets/rpg-audio (drawKnife1.ogg) | Kenney | CC0 1.0
- public/assets/audio/metal-impact-1.ogg | https://kenney.nl/assets/rpg-audio (metalPot1.ogg) | Kenney | CC0 1.0
- public/assets/audio/metal-impact-2.ogg | https://kenney.nl/assets/rpg-audio (metalPot2.ogg) | Kenney | CC0 1.0
- public/assets/audio/metal-impact-3.ogg | https://kenney.nl/assets/rpg-audio (metalPot3.ogg) | Kenney | CC0 1.0
- public/assets/audio/door-latch.ogg | https://kenney.nl/assets/rpg-audio (metalLatch.ogg) | Kenney | CC0 1.0
- public/assets/audio/shutter.ogg | https://kenney.nl/assets/rpg-audio (creak2.ogg) | Kenney | CC0 1.0
- public/assets/audio/document-stamp.ogg | https://kenney.nl/assets/rpg-audio (bookPlace1.ogg) | Kenney | CC0 1.0

### Kenney Interface Sounds

- public/assets/audio/badge-accept.ogg | https://kenney.nl/assets/interface-sounds (confirmation_001.ogg) | Kenney | CC0 1.0
- public/assets/audio/badge-deny.ogg | https://kenney.nl/assets/interface-sounds (error_001.ogg) | Kenney | CC0 1.0
- public/assets/audio/breaker-trip.ogg | https://kenney.nl/assets/interface-sounds (switch_003.ogg) | Kenney | CC0 1.0
- public/assets/audio/camera-return.ogg | https://kenney.nl/assets/interface-sounds (toggle_002.ogg) | Kenney | CC0 1.0
- public/assets/audio/plant-complete.ogg | https://kenney.nl/assets/interface-sounds (confirmation_003.ogg) | Kenney | CC0 1.0

## Generated textures

Like the audio, the Phase 10 atmosphere textures are generated at runtime and
never shipped as files: the soft particle dot (dust, steam, haze), the CCTV
grain, and the lighting mask are all drawn onto canvases in code at boot.

- Soft particle dot, CCTV noise, light mask | generated in src/systems/ and src/scenes/HijackScene.ts (canvas drawing) | CJM Labs | CC0 1.0

## Fonts

Fonts are bundled as npm packages via Fontsource, both licensed under the SIL Open Font License 1.1:

- Saira Condensed | https://fontsource.org/fonts/saira-condensed | Omnibus-Type | OFL-1.1
- IBM Plex Mono | https://fontsource.org/fonts/ibm-plex-mono | IBM | OFL-1.1
