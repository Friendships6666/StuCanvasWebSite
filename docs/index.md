# Introducing StuCanvas

StuCanvas is an open-source, high-performance, Vulkan-based comprehensive engine designed specifically for interactive real-time and offline scientific visualization. By bypassing the CPU and driver bottlenecks of traditional WebGL/OpenGL, StuCanvas leverages modern GPU architectures to render complex mathematical, physical, and chemical models with high precision, striving to define the **next generation of scientific visualization libraries**.

This documentation provides a comprehensive guide to understanding, deploying, and extending StuCanvas for your scientific research and visualization workflows.

---

## Core Feature Modules

StuCanvas integrates cutting-edge computer graphics, CAD engineering, and numerical computing into a unified, developer-friendly C++ API.

### 1. Parametric Modeling (2D & 3D)
Define complex 2D and 3D geometric structures mathematically. Inspired by industry-grade CAD software like **Creo** and interactive mathematics suites like **GeoGebra**, this module is driven by a robust **Directed Acyclic Graph (DAG)** execution engine. It supports a wide array of common parametric modeling operations (such as extrusions, sweeps, and boolean operations), evaluating mathematical relationships and constructing topological representations in real-time.

### 2. High-Performance Dynamic Geometry
Create and manipulate geometric constraints dynamically with an experience analogous to **GeoGebra**, but supercharged with Vulkan-native performance and a vastly expanded feature set. Designed for high-frequency interactive updates, it optimizes vertex and index buffers with minimum latency, supporting rich interactive geometric operations that are computationally prohibitive on legacy platforms.

### 3. State-of-the-Art Function Plotting
Experience plotting driven by pioneering mathematical algorithms. StuCanvas classifies plotting into **black-box scalar functions**, **interval-defined functions**, and more. By combining rigorous **Interval Arithmetic**, **L-SHADE** (Successor History-based Adaptive Differential Evolution) global search, and highly optimized contouring algorithms like **Marching Squares** (and Marching Cubes), the engine accurately isolates boundaries, roots, and singularities, rendering pixel-perfect topological features without missing critical points.

### 4. NLE Architecture & Concurrency
Engineered around a modern **Non-Linear Editing (NLE) architecture** supporting **$O(1)$ temporal seek/jump animations** with zero-overhead state reconstruction. The engine fully utilizes modern **multi-core CPUs** via task-parallel schedulers to offload mathematical generation, seamlessly feeding Vulkan's compute and graphics queues for real-time physical and chemical simulations.

### 5. Advanced Rendering & OpenPBR
Enjoy a highly modern, intuitive, and simple C++ API supporting both **real-time interactive preview** and high-fidelity **offline export**. It features native, hardware-accelerated **Vulkan Ray Tracing** (`VK_KHR_ray_tracing_pipeline`) and fully implements the complete **OpenPBR** material specification. Render photorealistic glass apparatuses, metallic lattices, and complex physical optics with physically accurate refraction, reflection, and subsurface scattering.

### 6. Dependency-Free Hardware Video Export
Export high-resolution rendering pipelines directly via native, hardware-accelerated GPU encoding APIs (such as NVIDIA NVENC, AMD AMF, and Intel QuickSync) **completely independent of external FFmpeg binaries**. It supports state-of-the-art codecs including **AV1, H.265 (HEVC), and H.264** up to an ultra-high resolution of **8192×8192 (8K)**, capturing framebuffers directly with zero memory-copy overhead.

---

## Next Steps

To begin using StuCanvas, please refer to the following guides:
