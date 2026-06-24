import {
  Viewer,
  Cesium3DTileset,
  Cesium3DTileStyle,
  HeadingPitchRange,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";

const viewer = new Viewer("cesiumContainer", {
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  timeline: false,
  animation: false,
  sceneModePicker: false,
  navigationHelpButton: false,
});

// 파란 지구본 숨기기
viewer.scene.globe.show = false;
viewer.scene.debugShowFramesPerSecond = true;

async function main() {
  try {
    console.log("Loading local 3D Tiles...");

    const tileset = await Cesium3DTileset.fromUrl("/tiles/tileset.json", {
      maximumScreenSpaceError: 1,
    });

    viewer.scene.primitives.add(tileset);

    // 점을 크게, 밝은 색으로 강제 표시
    tileset.style = new Cesium3DTileStyle({
      pointSize: "5.0",
      color: "color('cyan')",
    });

    tileset.debugShowBoundingVolume = true;

    console.log("Tileset loaded:", tileset);
    console.log("Bounding sphere:", tileset.boundingSphere);

    await viewer.zoomTo(
      tileset,
      new HeadingPitchRange(0, -0.5, tileset.boundingSphere.radius * 4)
    );

    console.log("Zoomed to tileset");
  } catch (error) {
    console.error("Failed to load local 3D Tiles:", error);
  }
}

main();