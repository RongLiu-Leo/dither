## Enhanced Error Diffusion [Website](https://rongliu-leo.github.io/dither/)

Error diffusion is one of the most widely used halftoning techniques, converting continuous-tone images into binary dot patterns while preserving perceived luminance. Classical diffusion methods such as Floyd–Steinberg, Stucki, and JJN distribute quantization error to neighboring pixels through fixed spatial kernels. These techniques deliver good tone reproduction but also exhibit characteristic artifacts:

- Excessive **large-magnitude error spikes**,  
- **Mixed-noise** textures in midtones,  
- **Low-contrast** rendition in smooth gradients,  
- **Directional streaking** depending on the kernel and scan order.

A key observation is that these artifacts arise not only from the **diffusion kernel**, but from the **distribution of error magnitudes** produced during quantization. Traditional error diffusion passes the raw error directly into the kernel, even when the error is large enough to dominate the subsequent neighborhood. This leads to instability in flat regions and noise clusters that become visually distracting.

### A General Enhancement: Nonlinear Error Mapping

The method introduced here—**[nonlinear error mapping](https://github.com/RongLiu-Leo/dither/blob/ec4d5d91bbc54aec23990d19e3461c08359cb750/script.js#L222)**—modifies the quantization error *before* diffusion by applying a smooth, bounded nonlinear mapping. This transform preserves sign and overall energy while gently redistributing error magnitudes:

- **Large errors are suppressed**, reducing harsh dot transitions and clumping.  
- **Small errors are slightly expanded**, increasing local microstructure.  
- The resulting **error histogram becomes more balanced**, improving tone consistency.  
- Noise becomes **more evenly distributed** spatially.

Importantly:

> **The enhancement is kernel-agnostic.**  
> It can be applied to **any error diffusion method**—Floyd–Steinberg, Stucki, JJN, Burkes, Sierra, etc.—and consistently improves perceptual results.

The enhancement is lightweight, local, and computationally trivial (~2–3 extra math operations per pixel). It does not alter the diffusion kernel or algorithmic structure, making it easy to integrate into existing halftoning pipelines.

### Demo

The interactive demo is available at the [project website](https://rongliu-leo.github.io/dither/).

Although the method works for all kernels, this repository uses **JJN + Enhancement** as the demonstration, called **Rong**.

By comparing **Rong vs. Others**, the advantage is clear:

- Smoother tonal transitions  
- Fewer midtone artifacts  
- Better local contrast  
- More stable dot patterns  
- Reduced mixed noise  

