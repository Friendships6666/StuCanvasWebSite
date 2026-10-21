// compiler.js

const PREFIX_MAP = {
    stage: { prefix: "VK_PIPELINE_STAGE_2_", fallback: "NONE" },
    access: { prefix: "VK_ACCESS_2_", fallback: "NONE" },
    layout: { prefix: "VK_IMAGE_LAYOUT_", fallback: "UNDEFINED" },
    aspect: { prefix: "VK_IMAGE_ASPECT_", fallback: "COLOR_BIT" }
};

function formatDefine(str, type) {
    if (!str) return PREFIX_MAP[type].prefix + PREFIX_MAP[type].fallback;
    if (str.startsWith("VK_")) return str;
    return PREFIX_MAP[type].prefix + str;
}

const SAMPLE_JSON = {
    "resources": [
        { "name": "GBuffer_Depth", "aspect": "DEPTH_BIT" },
        { "name": "Camera_HDR_Output", "aspect": "COLOR_BIT" },
        { "name": "Swapchain_Image", "aspect": "COLOR_BIT" }
    ],
    "passes": [
        {
            "name": "Z_Prepass",
            "writes": [
                {
                    "resource": "GBuffer_Depth",
                    "stage": "EARLY_FRAGMENT_TESTS_BIT",
                    "access": "DEPTH_STENCIL_ATTACHMENT_WRITE_BIT",
                    "layout": "DEPTH_STENCIL_ATTACHMENT_OPTIMAL"
                }
            ]
        },
        {
            "name": "RayTraced_AO",
            "reads": [
                {
                    "resource": "GBuffer_Depth",
                    "stage": "COMPUTE_SHADER_BIT",
                    "access": "SHADER_READ_BIT",
                    "layout": "DEPTH_STENCIL_READ_ONLY_OPTIMAL"
                }
            ]
        },
        {
            "name": "Main_Rendering",
            "writes": [
                {
                    "resource": "Camera_HDR_Output",
                    "stage": "COLOR_ATTACHMENT_OUTPUT_BIT",
                    "access": "COLOR_ATTACHMENT_WRITE_BIT",
                    "layout": "COLOR_ATTACHMENT_OPTIMAL"
                }
            ]
        },
        {
            "name": "PostProcess_Blend",
            "reads": [
                {
                    "resource": "Camera_HDR_Output",
                    "stage": "COMPUTE_SHADER_BIT",
                    "access": "SHADER_READ_BIT",
                    "layout": "SHADER_READ_ONLY_OPTIMAL"
                }
            ],
            "writes": [
                {
                    "resource": "Swapchain_Image",
                    "stage": "COMPUTE_SHADER_BIT",
                    "access": "SHADER_WRITE_BIT",
                    "layout": "GENERAL"
                }
            ]
        },
        {
            "name": "Present",
            "reads": [
                {
                    "resource": "Swapchain_Image",
                    "stage": "NONE",
                    "access": "NONE",
                    "layout": "PRESENT_SRC_KHR"
                }
            ]
        }
    ]
};

function compileBarriers(inputJson) {
    let graphData;
    try {
        graphData = JSON.parse(inputJson);
    } catch (e) {
        throw new Error(`JSON 解析失败: ${e.message}`);
    }

    const resources = graphData.resources || [];
    const passes = graphData.passes || [];

    const resourceMap = {};
    resources.forEach(r => {
        resourceMap[r.name] = {
            name: r.name,
            aspect: formatDefine(r.aspect, "aspect"),
            current_layout: "VK_IMAGE_LAYOUT_UNDEFINED",
            current_stage: "VK_PIPELINE_STAGE_2_NONE",
            current_access: "VK_ACCESS_2_NONE"
        };
    });

    const compiledPasses = [];
    const uniqueResourcesSet = new Set();

    passes.forEach(pass => {
        const barriers = [];

        const processInteraction = (inter) => {
            const resName = inter.resource;
            uniqueResourcesSet.add(resName);

            if (!resourceMap[resName]) {
                resourceMap[resName] = {
                    name: resName,
                    aspect: "VK_IMAGE_ASPECT_COLOR_BIT",
                    current_layout: "VK_IMAGE_LAYOUT_UNDEFINED",
                    current_stage: "VK_PIPELINE_STAGE_2_NONE",
                    current_access: "VK_ACCESS_2_NONE"
                };
            }

            const res = resourceMap[resName];
            const targetLayout = formatDefine(inter.layout, "layout");
            const targetStage = formatDefine(inter.stage, "stage");
            const targetAccess = formatDefine(inter.access, "access");

            if (res.current_layout !== targetLayout ||
                res.current_stage !== targetStage ||
                res.current_access !== targetAccess)
            {
                barriers.push({
                    resource_name: res.name,
                    aspect_mask: res.aspect,
                    old_layout: res.current_layout,
                    new_layout: targetLayout,
                    src_stage: res.current_stage,
                    dst_stage: targetStage,
                    src_access: res.current_access,
                    dst_access: targetAccess
                });

                res.current_layout = targetLayout;
                res.current_stage = targetStage;
                res.current_access = targetAccess;
            }
        };

        if (pass.reads) pass.reads.forEach(r => processInteraction(r));
        if (pass.writes) pass.writes.forEach(w => processInteraction(w));

        compiledPasses.push({
            name: pass.name,
            barriers
        });
    });

    return {
        passes: compiledPasses,
        uniqueResources: Array.from(uniqueResourcesSet)
    };
}

function generateCppClassCode(compiledData) {
    const { passes, uniqueResources } = compiledData;

    let code = `// =========================================================================
// 🚀 Generated by StuVkUtils AOT Pipeline Barrier Class (C++ 23 Header-Only)
// 💡 Zero-Overhead: Direct static memory layout, no vector allocations [1].
// =========================================================================
#pragma once
#include <vulkan/vulkan.h>

namespace StuVkUtils {

    class GeneratedBarrierSync {
    private:
        // 💡 外部图像句柄指针：动态解引用，适应多帧在途的句柄轮转结构 [1]
`;

    // 1. 声明外部资源追踪指针成员
    uniqueResources.forEach(res => {
        code += `        const VkImage* p_image_${res}_ = nullptr;\n`;
    });

    code += `\n`;

    // 2. 为每个包含状态转换的 Pass 声明专属的静态内存数据块，规避临时栈分配 [1]
    passes.forEach((pass, idx) => {
        if (pass.barriers.length === 0) return;

        code += `        // ---------------------------------------------------------\n`;
        code += `        // 💡 Pass '${pass.name}' 持久化静态屏障块 [1]\n`;
        code += `        // ---------------------------------------------------------\n`;
        code += `        struct Pass_${pass.name}_Block {\n`;
        code += `            VkDependencyInfo dep_info{};\n`;
        code += `            VkImageMemoryBarrier2 barriers[${pass.barriers.length}];\n`;
        code += `        } pass_${pass.name}_;\n\n`;
    });

    code += `    public:
        /**
         * @brief 构造函数：接受外部资源的指针地址，在初始化阶段（慢路径）完成静态布局绑定 [1]
         */
        GeneratedBarrierSync(\n`;

    // 3. 生成构造函数参数列表
    uniqueResources.forEach((res, rIdx) => {
        code += `            const VkImage* p_image_${res}${rIdx === uniqueResources.length - 1 ? '' : ','}\n`;
    });

    code += `        ) {\n`;
    code += `            // 绑定外部指针成员\n`;
    uniqueResources.forEach(res => {
        code += `            p_image_${res}_ = p_image_${res};\n`;
    });
    code += `\n`;

    // 4. 初始化每个控制块的固定属性
    passes.forEach((pass, idx) => {
        if (pass.barriers.length === 0) return;

        const pBlockVar = `pass_${pass.name}_`;

        code += `            // --- Initialize Pass: ${pass.name} ---\n`;
        pass.barriers.forEach((b, bIdx) => {
            code += `            ${pBlockVar}.barriers[${bIdx}] = {\n`;
            code += `                .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2,\n`;
            code += `                .pNext = nullptr,\n`;
            code += `                .srcStageMask = ${b.src_stage},\n`;
            code += `                .srcAccessMask = ${b.src_access},\n`;
            code += `                .dstStageMask = ${b.dst_stage},\n`;
            code += `                .dstAccessMask = ${b.dst_access},\n`;
            code += `                .oldLayout = ${b.old_layout},\n`;
            code += `                .newLayout = ${b.new_layout},\n`;
            code += `                .srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,\n`;
            code += `                .dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,\n`;
            code += `                .image = VK_NULL_HANDLE, // 💡 在录制期动态解引用装填\n`;
            code += `                .subresourceRange = {\n`;
            code += `                    .aspectMask = ${b.aspect_mask},\n`;
            code += `                    .baseMipLevel = 0,\n`;
            code += `                    .levelCount = 1,\n`;
            code += `                    .baseArrayLayer = 0,\n`;
            code += `                    .layerCount = 1\n`;
            code += `                }\n`;
            code += `            };\n`;
        });

        // 绑定依存描述关系指向静态成员地址，防止悬空崩溃 [1]
        code += `            ${pBlockVar}.dep_info = {\n`;
        code += `                .sType = VK_STRUCTURE_TYPE_DEPENDENCY_INFO,\n`;
        code += `                .pNext = nullptr,\n`;
        code += `                .imageMemoryBarrierCount = ${pass.barriers.length},\n`;
        code += `                .pImageMemoryBarriers = ${pBlockVar}.barriers\n`;
        code += `            };\n\n`;
    });

    code += `        }\n\n`;

    // =========================================================================
    // 💡 5. 录制成员函数发射：直接向 cmd 写入 barrier，外部不需要触碰 Vulkan 屏障结构体 [1]
    // =========================================================================
    passes.forEach((pass, idx) => {
        code += `        /**\n`;
        code += `         * @brief 向命令缓冲区录制 '${pass.name}' 阶段入口所需的图像屏障与布局转换 [1]\n`;
        code += `         */\n`;
        code += `        void record_barrier_${pass.name}(VkCommandBuffer cmd) noexcept {\n`;

        if (pass.barriers.length > 0) {
            const pBlockVar = `pass_${pass.name}_`;
            // 快路径：仅执行最基础的指针解引用写入最新句柄，随后进行物理录制 [1]
            pass.barriers.forEach((b, bIdx) => {
                code += `            ${pBlockVar}.barriers[${bIdx}].image = *p_image_${b.resource_name}_;\n`;
            });
            code += `            vkCmdPipelineBarrier2(cmd, &${pBlockVar}.dep_info);\n`;
        } else {
            code += `            // 该通道无图像状态转换需求 [1]\n`;
        }

        code += `        }\n\n`;
    });

    code += `    };\n\n`;
    code += `} // namespace StuVkUtils`;

    return code;
}

document.addEventListener("DOMContentLoaded", () => {
    const jsonInput = document.getElementById("json-input");
    const cppOutput = document.getElementById("cpp-output");
    const btnCompile = document.getElementById("btn-compile");
    const btnCopy = document.getElementById("btn-copy");
    const btnLoadSample = document.getElementById("btn-load-sample");
    const statusText = document.getElementById("status-text");

    const loadSample = () => {
        jsonInput.value = JSON.stringify(SAMPLE_JSON, null, 4);
    };

    loadSample();

    const performCompilation = () => {
        const rawJson = jsonInput.value;
        try {
            statusText.innerText = "● 状态: 正在编译...";
            statusText.className = "text-yellow-400 font-medium";

            const compiledData = compileBarriers(rawJson);
            const cppCode = generateCppClassCode(compiledData);

            cppOutput.value = cppCode;
            statusText.innerText = "● 状态: 编译成功";
            statusText.className = "text-green-400 font-medium";
        } catch (err) {
            cppOutput.value = `// ❌ 生成失败：\n// ${err.message}`;
            statusText.innerText = `● 状态: 编译失败`;
            statusText.className = "text-red-400 font-medium";
        }
    };

    btnCompile.addEventListener("click", performCompilation);
    btnLoadSample.addEventListener("click", () => {
        loadSample();
        performCompilation();
    });

    btnCopy.addEventListener("click", () => {
        navigator.clipboard.writeText(cppOutput.value).then(() => {
            const originalText = btnCopy.innerText;
            btnCopy.innerText = "✓ 已复制！";
            btnCopy.className = "text-green-400 font-bold uppercase transition";
            setTimeout(() => {
                btnCopy.innerText = originalText;
                btnCopy.className = "text-blue-400 hover:text-blue-300 font-bold uppercase transition";
            }, 2000);
        });
    });
});