// compiler.js

const STAGE_MAP = {
    "TOP_OF_PIPE_BIT": "VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT",
    "BOTTOM_OF_PIPE_BIT": "VK_PIPELINE_STAGE_2_BOTTOM_OF_PIPE_BIT",
    "VERTEX_SHADER_BIT": "VK_PIPELINE_STAGE_2_VERTEX_SHADER_BIT",
    "FRAGMENT_SHADER_BIT": "VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT",
    "COMPUTE_SHADER_BIT": "VK_PIPELINE_STAGE_2_COMPUTE_SHADER_BIT",
    "COLOR_ATTACHMENT_OUTPUT_BIT": "VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT",
    "EARLY_FRAGMENT_TESTS_BIT": "VK_PIPELINE_STAGE_2_EARLY_FRAGMENT_TESTS_BIT",
    "LATE_FRAGMENT_TESTS_BIT": "VK_PIPELINE_STAGE_2_LATE_FRAGMENT_TESTS_BIT",
    "TRANSFER_BIT": "VK_PIPELINE_STAGE_2_TRANSFER_BIT",
    "ALL_COMMANDS_BIT": "VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT"
};

function formatStageMask(stage) {
    if (!stage) return "VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT";
    if (STAGE_MAP[stage]) return STAGE_MAP[stage];
    if (stage.startsWith("VK_")) return stage;
    return `VK_PIPELINE_STAGE_2_${stage}`;
}

const SAMPLE_JSON = {
    "tasks": [
        {
            "name": "Upload_Constants",
            "queue": "Transfer",
            "dependencies": []
        },
        {
            "name": "Upload_Dynamic_Skins",
            "queue": "Transfer",
            "dependencies": []
        },
        {
            "name": "Compute_Physics",
            "queue": "Compute",
            "dependencies": [
                { "parent": "Upload_Constants", "stage": "COMPUTE_SHADER_BIT" }
            ]
        },
        {
            "name": "Compute_Skinning",
            "queue": "Compute",
            "dependencies": [
                { "parent": "Upload_Dynamic_Skins", "stage": "COMPUTE_SHADER_BIT" },
                { "parent": "Compute_Physics", "stage": "COMPUTE_SHADER_BIT" }
            ]
        },
        {
            "name": "Shadow_Pass_Main_Light",
            "queue": "Graphics",
            "dependencies": [
                { "parent": "Upload_Constants", "stage": "VERTEX_SHADER_BIT" }
            ]
        },
        {
            "name": "Shadow_Pass_Local_Lights",
            "queue": "Graphics",
            "dependencies": [
                { "parent": "Upload_Constants", "stage": "VERTEX_SHADER_BIT" },
                { "parent": "Compute_Physics", "stage": "VERTEX_SHADER_BIT" }
            ]
        },
        {
            "name": "Z_Prepass",
            "queue": "Graphics",
            "dependencies": [
                { "parent": "Compute_Skinning", "stage": "VERTEX_SHADER_BIT" }
            ]
        },
        {
            "name": "RayTraced_AO",
            "queue": "Compute",
            "dependencies": [
                { "parent": "Z_Prepass", "stage": "COMPUTE_SHADER_BIT" },
                { "parent": "Shadow_Pass_Main_Light", "stage": "COMPUTE_SHADER_BIT" }
            ]
        },
        {
            "name": "GBuffer_Pass",
            "queue": "Graphics",
            "dependencies": [
                { "parent": "Z_Prepass", "stage": "EARLY_FRAGMENT_TESTS_BIT" },
                { "parent": "Compute_Skinning", "stage": "VERTEX_SHADER_BIT" }
            ]
        },
        {
            "name": "Direct_Lighting_Opaque",
            "queue": "Graphics",
            "dependencies": [
                { "parent": "GBuffer_Pass", "stage": "FRAGMENT_SHADER_BIT" },
                { "parent": "Shadow_Pass_Main_Light", "stage": "FRAGMENT_SHADER_BIT" },
                { "parent": "Shadow_Pass_Local_Lights", "stage": "FRAGMENT_SHADER_BIT" }
            ]
        },
        {
            "name": "Deferred_Composition_Ambient",
            "queue": "Graphics",
            "dependencies": [
                { "parent": "Direct_Lighting_Opaque", "stage": "FRAGMENT_SHADER_BIT" },
                { "parent": "RayTraced_AO", "stage": "FRAGMENT_SHADER_BIT" }
            ]
        },
        {
            "name": "PostProcess_Bloom",
            "queue": "Compute",
            "dependencies": [
                { "parent": "Deferred_Composition_Ambient", "stage": "COMPUTE_SHADER_BIT" }
            ]
        },
        {
            "name": "PostProcess_ColorGrading",
            "queue": "Compute",
            "dependencies": [
                { "parent": "PostProcess_Bloom", "stage": "COMPUTE_SHADER_BIT" }
            ]
        },
        {
            "name": "UI_Overlay_Pass",
            "queue": "Graphics",
            "dependencies": [
                { "parent": "PostProcess_ColorGrading", "stage": "FRAGMENT_SHADER_BIT" },
                { "parent": "EXTERNAL_SWAPCHAIN_ACQUIRE", "stage": "COLOR_ATTACHMENT_OUTPUT_BIT" }
            ]
        },
        {
            "name": "Present_Resolve_Pass",
            "queue": "Graphics",
            "dependencies": [
                { "parent": "UI_Overlay_Pass", "stage": "COLOR_ATTACHMENT_OUTPUT_BIT" }
            ]
        }
    ]
};

function compileAOTGraph(inputJson) {
    let graphData;
    try {
        graphData = JSON.parse(inputJson);
        if (!graphData.tasks || !Array.isArray(graphData.tasks)) {
            throw new Error("JSON invalid: missing 'tasks' array.");
        }
    } catch (e) {
        throw new Error(`JSON parse error: ${e.message}`);
    }

    const tasks = graphData.tasks;
    const taskMap = {};
    const inDegree = {};
    const adj = {};

    tasks.forEach(t => {
        taskMap[t.name] = t;
        inDegree[t.name] = 0;
        adj[t.name] = [];
    });

    tasks.forEach(t => {
        if (t.dependencies) {
            t.dependencies.forEach(dep => {
                if (dep.parent === "EXTERNAL_SWAPCHAIN_ACQUIRE") return;
                const parent = dep.parent;
                if (!taskMap[parent]) {
                    throw new Error(`Undeclared dependency: '${parent}' required by '${t.name}'.`);
                }
                adj[parent].push(t.name);
                inDegree[t.name]++;
            });
        }
    });

    // Kahn Sort
    const queue = [];
    tasks.forEach(t => {
        if (inDegree[t.name] === 0) {
            queue.push(t.name);
        }
    });

    const sortedTasks = [];
    while (queue.length > 0) {
        const u = queue.shift();
        sortedTasks.push(taskMap[u]);

        adj[u].forEach(v => {
            inDegree[v]--;
            if (inDegree[v] === 0) {
                queue.push(v);
            }
        });
    }

    if (sortedTasks.length !== tasks.length) {
        throw new Error("Cyclic dependency detected.");
    }

    const batches = [];
    let currentBatch = null;
    let hasActiveBatch = false;

    for (let i = 0; i < sortedTasks.length; i++) {
        const task = sortedTasks[i];

        const queueChanged = hasActiveBatch && (task.queue !== currentBatch.queue_type);

        let hasCrossQueueOrExternalWaits = false;
        if (task.dependencies) {
            task.dependencies.forEach(dep => {
                if (dep.parent === "EXTERNAL_SWAPCHAIN_ACQUIRE") {
                    hasCrossQueueOrExternalWaits = true;
                } else {
                    const parentTask = taskMap[dep.parent];
                    if (parentTask && parentTask.queue !== task.queue) {
                        hasCrossQueueOrExternalWaits = true;
                    }
                }
            });
        }

        if (queueChanged || (hasActiveBatch && hasCrossQueueOrExternalWaits)) {
            if (currentBatch) {
                batches.push(currentBatch);
            }
            currentBatch = null;
            hasActiveBatch = false;
        }

        if (!hasActiveBatch) {
            currentBatch = {
                queue_type: task.queue,
                tasks: [],
                command_buffers: [],
                waits: [],
                signals: []
            };
            hasActiveBatch = true;
        }

        currentBatch.tasks.push(task);
        currentBatch.command_buffers.push(`cmd_${task.name}`);
    }

    if (hasActiveBatch && currentBatch) {
        batches.push(currentBatch);
    }

    let graphicsCounter = 0;
    let computeCounter = 0;
    let transferCounter = 0;

    const taskBatchMapping = {};

    batches.forEach((batch, batchIdx) => {
        let signalVal = 0;
        switch (batch.queue_type) {
            case "Graphics":
                graphicsCounter++;
                signalVal = graphicsCounter;
                break;
            case "Compute":
                computeCounter++;
                signalVal = computeCounter;
                break;
            case "Transfer":
                transferCounter++;
                signalVal = transferCounter;
                break;
        }

        batch.signal_value = signalVal;

        batch.tasks.forEach(task => {
            taskBatchMapping[task.name] = {
                batch_index: batchIdx,
                signal_value: signalVal,
                queue: batch.queue_type
            };
        });
    });

    batches.forEach((batch, batchIdx) => {
        let batchWaitMerger = {};

        batch.tasks.forEach(task => {
            if (task.dependencies) {
                task.dependencies.forEach(dep => {
                    const formattedStage = formatStageMask(dep.stage);

                    if (dep.parent === "EXTERNAL_SWAPCHAIN_ACQUIRE") {
                        const semName = "external_acquired_sem";
                        if (!batchWaitMerger[semName]) batchWaitMerger[semName] = {};
                        if (!batchWaitMerger[semName]["0"]) batchWaitMerger[semName]["0"] = { set: new Set(), is_external: true, queue: null };
                        batchWaitMerger[semName]["0"].set.add(formattedStage);
                    } else {
                        const parentMapping = taskBatchMapping[dep.parent];
                        if (parentMapping && parentMapping.queue !== batch.queue_type) {
                            const semName = `${parentMapping.queue.toLowerCase()}_sem`;
                            const val = parentMapping.signal_value;

                            if (!batchWaitMerger[semName]) batchWaitMerger[semName] = {};
                            if (!batchWaitMerger[semName][val]) {
                                batchWaitMerger[semName][val] = { set: new Set(), is_external: false, queue: parentMapping.queue };
                            }
                            batchWaitMerger[semName][val].set.add(formattedStage);
                        }
                    }
                });
            }
        });

        batch.waits = Object.entries(batchWaitMerger).flatMap(([sem, valMap]) =>
            Object.entries(valMap).map(([val, info]) => ({
                semaphore_var: sem,
                value: parseInt(val),
                is_external: info.is_external,
                parent_queue: info.queue,
                stage_mask: Array.from(info.set).join(" | ")
            }))
        );

        const semName = `${batch.queue_type.toLowerCase()}_sem`;
        batch.signals = [{
            semaphore_var: semName,
            value: batch.signal_value,
            is_external: false,
            stage_mask: "VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT"
        }];
    });

    return {
        batches
    };
}

function generateCppClassCode(compiledData, tasks) {
    const { batches } = compiledData;

    const queueBatches = {
        "Graphics": [],
        "Compute": [],
        "Transfer": []
    };

    batches.forEach(b => {
        queueBatches[b.queue_type].push(b);
    });

    let hasExternalAcquire = false;
    let hasExternalFinished = false;

    batches.forEach(b => {
        b.waits.forEach(w => {
            if (w.semaphore_var === "external_acquired_sem") hasExternalAcquire = true;
        });
    });
    if (batches.length > 0) {
        hasExternalFinished = true;
    }

    let code = `// =========================================================================
// 🚀 Generated by StuVkUtils AOT Persistent Submission Class (C++ 23 Header-Only)
// 💡 Absolute Zero Runtime Overhead: Direct static memory layout, no vector allocations [1].
// =========================================================================
#pragma once
#include <vulkan/vulkan.h>

namespace StuVkUtils {

    class GeneratedPipelineSync {
    private:
        // 外部依赖硬件队列句柄
        VkQueue graphics_queue_ = VK_NULL_HANDLE;
        VkQueue compute_queue_ = VK_NULL_HANDLE;
        VkQueue transfer_queue_ = VK_NULL_HANDLE;

        // 💡 外部引用的追踪指针成员声明：用于动态感知外部 loop 中句柄的轮转与切换
`;

    // 声明 CommandBuffer 外部引用指针成员
    tasks.forEach(t => {
        code += `        const VkCommandBuffer* p_cmd_${t.name}_ = nullptr;\n`;
    });

    if (hasExternalAcquire) {
        code += `        const VkSemaphore* p_external_acquired_sem_ = nullptr;\n`;
    }
    if (hasExternalFinished) {
        code += `        const VkSemaphore* p_external_render_finished_sem_ = nullptr;\n`;
    }

    code += `\n`;

    // 声明静态批次控制块
    Object.entries(queueBatches).forEach(([qType, bList]) => {
        if (bList.length === 0) return;

        code += `        // ---------------------------------------------------------\n`;
        code += `        // 💡 ${qType} 队列的持久化静态提交控制块 [1]\n`;
        code += `        // ---------------------------------------------------------\n`;
        code += `        struct ${qType}SubmissionBlock {\n`;
        code += `            VkSubmitInfo2 submits[${bList.length}];\n`;

        bList.forEach((b, bIdx) => {
            code += `            VkCommandBufferSubmitInfo cmds_${bIdx}[${b.command_buffers.length}];\n`;
            if (b.waits.length > 0) {
                code += `            VkSemaphoreSubmitInfo waits_${bIdx}[${b.waits.length}];\n`;
            }
            const isLastOfAll = (batches.indexOf(b) === batches.length - 1);
            const sigCount = 1 + (isLastOfAll ? 1 : 0);
            code += `            VkSemaphoreSubmitInfo signals_${bIdx}[${sigCount}];\n`;
        });

        code += `        } ${qType.toLowerCase()}_submission_;\n\n`;
    });

    code += `    public:
        /**
         * @brief 构造函数：接受外部队列与各个 CommandBuffer 的指针地址，完成静态内存布局绑定 [1]
         */
        GeneratedPipelineSync(
            VkQueue graphics_queue,
            VkQueue compute_queue,
            VkQueue transfer_queue,
            VkSemaphore graphics_sem,
            VkSemaphore compute_sem,
            VkSemaphore transfer_sem,\n`;

    // 构造函数参数列表：完全使用指针类型，解除值拷贝带来的生命周期锁死
    tasks.forEach(t => {
        code += `            const VkCommandBuffer* p_cmd_${t.name},\n`;
    });

    if (hasExternalAcquire) {
        code += `            const VkSemaphore* p_external_acquired_sem,\n`;
    }
    if (hasExternalFinished) {
        code += `            const VkSemaphore* p_external_render_finished_sem\n`;
    }

    code += `        ) : graphics_queue_(graphics_queue),
            compute_queue_(compute_queue),
            transfer_queue_(transfer_queue)
        {
            // 绑定外部指针成员
`;

    tasks.forEach(t => {
        code += `            p_cmd_${t.name}_ = p_cmd_${t.name};\n`;
    });
    if (hasExternalAcquire) {
        code += `            p_external_acquired_sem_ = p_external_acquired_sem;\n`;
    }
    if (hasExternalFinished) {
        code += `            p_external_render_finished_sem_ = p_external_render_finished_sem;\n`;
    }

    code += `\n`;

    // 构造函数体：组装结构体的固定拓扑边界 [1]
    Object.entries(queueBatches).forEach(([qType, bList]) => {
        if (bList.length === 0) return;

        const qVarLower = `${qType.toLowerCase()}_submission_`;

        bList.forEach((b, bIdx) => {
            code += `            // --- Initialize ${qType} Batch ${bIdx} ---\n`;

            // 1. 结构体初始化配置 (commandBuffer 具体值将在 submit 期解引用填充)
            b.command_buffers.forEach((cb, cbIdx) => {
                code += `            ${qVarLower}.cmds_${bIdx}[${cbIdx}] = {\n`;
                code += `                .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_SUBMIT_INFO\n`;
                code += `            };\n`;
            });

            // 2. 填充等候信号量信息（时间轴信号量数值直接静态硬编码！） [1]
            if (b.waits.length > 0) {
                b.waits.forEach((w, wIdx) => {
                    const targetSemName = w.is_external ? `*p_${w.semaphore_var}_` : `${w.semaphore_var}`;
                    code += `            ${qVarLower}.waits_${bIdx}[${wIdx}] = {\n`;
                    code += `                .sType = VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO,\n`;
                    code += `                .semaphore = ${w.is_external ? 'VK_NULL_HANDLE' : targetSemName}, // 外部信号量将在 submit 期解引用动态装填\n`;
                    code += `                .value = ${w.value}, // 💡 AOT 期硬编码确定的静态时间轴数值 [1]\n`;
                    code += `                .stageMask = ${w.stage_mask}\n`;
                    code += `            };\n`;
                });
            }

            // 3. 填充释放信号量信息（时间轴信号量数值直接静态硬编码！） [1]
            code += `            ${qVarLower}.signals_${bIdx}[0] = {\n`;
            code += `                .sType = VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO,\n`;
            code += `                .semaphore = ${qType.toLowerCase()}_sem,\n`;
            code += `                .value = ${b.signal_value}, // 💡 AOT 期硬编码确定的静态时间轴数值 [1]\n`;
            code += `                .stageMask = VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT\n`;
            code += `            };\n`;

            const isLastOfAll = (batches.indexOf(b) === batches.length - 1);
            if (isLastOfAll) {
                code += `            ${qVarLower}.signals_${bIdx}[1] = {\n`;
                code += `                .sType = VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO,\n`;
                code += `                .semaphore = VK_NULL_HANDLE,\n`;
                code += `                .value = 0,\n`;
                code += `                .stageMask = VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT\n`;
                code += `            };\n`;
            }

            // 4. 一次性组装并锁定 SubmitInfo 结构体的数组指针关系 [1]
            code += `            ${qVarLower}.submits[${bIdx}] = {\n`;
            code += `                .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO_2,\n`;
            code += `                .pNext = nullptr,\n`;
            code += `                .waitSemaphoreInfoCount = ${b.waits.length},\n`;
            code += `                .pWaitSemaphoreInfos = ${b.waits.length > 0 ? `${qVarLower}.waits_${bIdx}` : 'nullptr'},\n`;
            code += `                .commandBufferInfoCount = ${b.command_buffers.length},\n`;
            code += `                .pCommandBufferInfos = ${qVarLower}.cmds_${bIdx},\n`;
            code += `                .signalSemaphoreInfoCount = ${1 + (isLastOfAll ? 1 : 0)},\n`;
            code += `                .pSignalSemaphoreInfos = ${qVarLower}.signals_${bIdx}\n`;
            code += `            };\n\n`;
        });
    });

    code += `        }\n\n`;

    // =========================================================================
    // 💡 物理提交成员函数：在执行期对变化句柄进行解引用就地覆盖，随后一键提交 [1, 2]
    // =========================================================================
    Object.entries(queueBatches).forEach(([qType, bList]) => {
        if (bList.length === 0) return;

        const qVarLower = `${qType.toLowerCase()}_submission_`;
        const qQueueLower = `${qType.toLowerCase()}_queue_`;

        code += `        /**\n`;
        code += `         * @brief 物理提交 ${qType} 队列的所有合并批次 [1, 2]\n`;
        code += `         */\n`;
        code += `        void submit_${qType.toLowerCase()}() noexcept {\n`;

        // 1. 就地从外部指针中拉取并填充最新句柄（不影响 static submits 结构，无任何内存分配） [1]
        bList.forEach((b, bIdx) => {
            b.command_buffers.forEach((cb, cbIdx) => {
                const rawName = cb.substring(4); // 去除 'cmd_' 前缀
                code += `            ${qVarLower}.cmds_${bIdx}[${cbIdx}].commandBuffer = *p_cmd_${rawName}_;\n`;
            });

            // 如果有外部信号量，就地解引用并覆盖最新的信号量句柄
            b.waits.forEach((w, wIdx) => {
                if (w.is_external) {
                    code += `            ${qVarLower}.waits_${bIdx}[${wIdx}].semaphore = *p_${w.semaphore_var}_;\n`;
                }
            });

            const isLastOfAll = (batches.indexOf(b) === batches.length - 1);
            if (isLastOfAll && hasExternalFinished) {
                code += `            ${qVarLower}.signals_${bIdx}[1].semaphore = *p_external_render_finished_sem_;\n`;
            }
        });

        code += `\n            // 🚀 一键物理发射该队列合并后的全部 ${bList.length} 个批次，彻底压榨 Submit 系统调用开销 [1, 2]\n`;
        code += `            vkQueueSubmit2(${qQueueLower}, ${bList.length}, ${qVarLower}.submits, VK_NULL_HANDLE);\n`;
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

            const compiledData = compileAOTGraph(rawJson);
            const graphObj = JSON.parse(rawJson);
            const cppCode = generateCppClassCode(compiledData, graphObj.tasks);

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