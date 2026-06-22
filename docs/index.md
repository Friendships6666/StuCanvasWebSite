# Introducing StuCanvas

StuCanvas is an open-source, high-performance, Vulkan-based comprehensive engine designed specifically for interactive real-time and offline scientific visualization. By bypassing the CPU and driver bottlenecks of traditional WebGL/OpenGL, StuCanvas leverages modern GPU architectures to render complex mathematical, physical, and chemical models with high precision.

This documentation provides a comprehensive guide to understanding, deploying, and extending StuCanvas for your scientific research and visualization workflows.

---

## Core Feature Modules

StuCanvas provides a rich set of specialized modules to cater to different scientific rendering requirements.

### 1. Parametric Modeling
Define complex 2D and 3D geometric surfaces using mathematical parameter equations. The engine parses parametric equations in real-time and dynamically constructs high-precision vertex buffers directly on the GPU, enabling real-time topological deformation and exploration.

### 2. Dynamic Geometry Creation
Generate and modify mesh topologies on-the-fly. Designed for time-varying datasets, this module optimizes dynamic vertex buffer updates (`VkBuffer`) with minimum latency, making it ideal for fluid boundaries, growing crystals, and mutating topologies.

### 3. Mathematical Function Plotting
Visualize 2D curves, 3D surfaces, vector fields, and high-dimensional contour plots. Standard coordinate grids, axis tick labeling, and color mapping (colormap) are executed via highly optimized GPU shaders, ensuring smooth zooming and rotation even with millions of data points.

### 4. Physical Simulation
Simulate and visualize classical mechanics, fluid dynamics (using Smoothed Particle Hydrodynamics or grid-based methods), and rigid body systems. The engine seamlessly bridges Vulkan Compute Shaders with Graphics Pipelines (Compute-to-Graphics pipeline barrier), allowing real-time physics calculations to render directly without round-tripping to the CPU.

### 5. Chemical & Molecular Simulation
Visualize molecular dynamics, crystal lattices, protein structures, and biochemical reaction networks. It supports sphere-tracing for atomic rendering, high-accuracy bond rendering, and real-time covalent bond calculation based on particle proximity.

### 6. OpenPBR Material Rendering
Leverage the industry-standard **OpenPBR** (Physically-Based Rendering) material specification. Achieve ultra-realistic previews of scientific apparatus, glass test tubes, metallic nodes, and translucent cellular tissues under accurate physical lighting and environment maps.

### 7. High-Performance Video Export
Export high-definition rendering results offline. Capture framebuffer images directly with hardware-accelerated video encoding (H.264 / HEVC) without interrupting the rendering pipeline. Output publication-ready video materials for research papers and academic presentations.

---

## Next Steps

To begin using StuCanvas, please refer to the following guides:

- Learn how to compile and run the engine in the [Installation Guide](/getting-started/install).
- Render your first Vulkan-driven coordinate axis in the [Quick Start Guide](/getting-started/quick-start).