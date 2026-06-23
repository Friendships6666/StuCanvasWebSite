# 安装指南

## 架构概述

StuCanvas 部署分为两部分：

- **前端**：SDL3 二进制程序，直接运行，负责窗口管理和事件循环。
- **后端**：C++ 动态库（`.so` / `.dll`），编译后通过函数指针注入到前端进程，实现模块热替换，无需重启进程即可更新运行时行为。

后端采用 C++23 模块（`import` / `export`）编译，减少头文件重复展开，缩短编译至启动的链路时间。

---

## 硬件要求

- 操作系统：Windows 10 / 11 或 Linux 发行版（仅 64 位，不支持 32 位）
- 内存：≥ 4 GB
- 磁盘剩余空间：≥ 1 GB
- GPU：使用 OpenPBR 材质资产时，必须配备支持硬件光线追踪的 GPU

---

## Linux

### Arch Linux

使用 AUR 助手安装 StuCanvas：

```bash
# 以 yay 为例
yay -S stucanvas

# 或使用 paru
paru -S stucanvas
```

安装后：

- 前端二进制 `stucanvas` 位于 `/usr/bin/`
- 后端动态库 `libstucanvas.so` 位于 `/usr/lib/`

直接运行前端即可加载后端库：

```bash
stucanvas
```

---

## Windows

目前仅支持通过 GitHub Releases 下载预编译包。

1. 打开 [StuCanvas Releases](https://github.com/friendships6666/StuCanvas/releases) 页面。
2. 下载最新版本的 `StuCanvas-x64-windows.zip`。
3. 解压到任意目录，文件结构如下：

```
StuCanvas/
├── stucanvas.exe       # 前端 SDL3 二进制程序
├── stucanvas.dll        # 后端动态库
└── data/                # 资源文件
```

4. 运行 `stucanvas.exe`。

---

## Apple macOS

不支持。

原因：StuCanvas 基于 Vulkan 图形 API，macOS 未提供原生 Vulkan 支持（仅通过 MoltenVK 转换层运行，该层当前未达到项目所需的功能覆盖范围）。

---

## 从源码编译

### 前置依赖

依赖项较多，作者已编写 CMake 脚本自动处理依赖检测与下载。用户无需手动配置各依赖项。

### 编译步骤

```bash
git clone https://github.com/friendships6666/StuCanvas.git
cd StuCanvas

# 配置
cmake -B build -DCMAKE_BUILD_TYPE=Release

# 编译
cmake --build build

# 运行
./build/bin/stucanvas
```

编译后端库时，模块接口单元（`.ixx`）由编译器一次扫描并生成 BMI（Built Module Interface）文件，后续编译直接读取 BMI，不重复解析头文件，以此缩短编译时间。
