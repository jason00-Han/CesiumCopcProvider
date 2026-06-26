import { PointPrimitiveCollection } from "cesium";
import { CopcMetadataLoader } from "./reader/CopcMetadataLoader";
import { CopcHierarchyLoader } from "./reader/CopcHierarchyLoader";
import { CopcChunkLoader } from "./reader/CopcChunkLoader";
import { VoxelSketch } from "./sketch/VoxelSketch";
import { CopcCache } from "./cache/CopcCache";
import { CopcBenchmark } from "./benchmark/CopcBenchmark";
import { CopcPointRenderer } from "./renderer/CopcPointRenderer";
import type {
  CesiumCopcProviderOptions,
  CopcBenchmarkResult,
  PointBuffer,
} from "./types";

export class CesiumCopcProvider extends PointPrimitiveCollection {
  readonly url: string;
  readonly options: CesiumCopcProviderOptions;
  benchmarkResult?: CopcBenchmarkResult;

  private constructor(url: string, options: CesiumCopcProviderOptions = {}) {
    super();
    this.url = url;
    this.options = options;
  }

  static async fromUrl(
    url: string,
    options: CesiumCopcProviderOptions = {},
  ): Promise<CesiumCopcProvider> {
    const provider = new CesiumCopcProvider(url, options);
    const benchmark = new CopcBenchmark();
    const pointBudget = options.pointBudget ?? options.maxPoints ?? 300_000;
    const cache = options.cache?.enabled === false
      ? undefined
      : new CopcCache({
          maxNodes: options.cache?.maxNodes,
          maxMemoryMB: options.cache?.maxMemoryMB,
        });

    benchmark.mark("total:start");

    benchmark.mark("metadata:start");
    const metadata = await CopcMetadataLoader.load(url);
    benchmark.mark("metadata:end");

    if (options.debug) {
      console.log("[CesiumCopcProvider] metadata", {
        pointCount: metadata.totalPointCount,
        pointDataRecordFormat: metadata.pointDataRecordFormat,
        info: metadata.info,
        vlrs: metadata.vlrs,
        wkt: metadata.wkt,
      });
    }

    benchmark.mark("hierarchy:start");
    const hierarchy = await CopcHierarchyLoader.loadRoot(metadata);
    const selectedNodes = CopcHierarchyLoader.selectNodesForBudget(
      hierarchy,
      pointBudget,
      options.maxDepth,
    );
    benchmark.mark("hierarchy:end");

    if (options.debug) {
      console.log("[CesiumCopcProvider] selected nodes", selectedNodes);
    }

    let decodedPointCount = 0;
    const nodeBuffers: PointBuffer[] = [];

    benchmark.mark("chunk:start");
    for (const node of selectedNodes) {
      const remaining = pointBudget - decodedPointCount;
      if (remaining <= 0) break;

      const cacheKey = `${url}:${node.key}:budget=${remaining}`;
      const cached = cache?.get(cacheKey);
      if (cached) {
        nodeBuffers.push(cached);
        decodedPointCount += cached.count;
        continue;
      }

      const buffer = await CopcChunkLoader.loadNodeBuffer(metadata, node, remaining);
      cache?.set(cacheKey, buffer);
      nodeBuffers.push(buffer);
      decodedPointCount += buffer.count;
    }
    const decodedBuffer = CopcChunkLoader.concat(nodeBuffers, pointBudget);
    benchmark.mark("chunk:end");

    benchmark.mark("sketch:start");
    const sketchEnabled = options.sketch?.enabled ?? true;
    const renderedBuffer = sketchEnabled
      ? new VoxelSketch({
          voxelSize: options.sketch?.voxelSize ?? 1.0,
          maxVoxels: options.sketch?.maxVoxels ?? pointBudget,
          method: options.sketch?.method === "voxel-first" ? "voxel-first" : "voxel-reservoir",
        }).apply(decodedBuffer)
      : decodedBuffer;
    benchmark.mark("sketch:end");

    benchmark.mark("render:start");
    CopcPointRenderer.renderToCollection(provider, renderedBuffer, options);
    benchmark.mark("render:end");

    benchmark.mark("total:end");

    provider.benchmarkResult = benchmark.buildResult({
      url,
      selectedNodeCount: selectedNodes.length,
      decodedPointCount,
      renderedPointCount: renderedBuffer.count,
      renderedBuffer,
    });

    if (options.benchmark) {
      benchmark.print(provider.benchmarkResult);
    }

    return provider;
  }
}

export * from "./types";
