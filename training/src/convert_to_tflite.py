"""
convert_to_tflite.py — QAT + TFLite INT8 conversion pipeline for 1D-CNN
"""

import argparse
import os
import random
import numpy as np
import torch
import torch.nn as nn
from torch.ao.quantization import get_default_qat_qconfig, prepare_qat, convert
from torch.optim import Adam

from dataset import get_dataloaders
from model import CNN1D, remap_cnn1d_checkpoint

from config import DATA_DIR, CKPT_DIR, DEPLOY_DIR

FUSE_LIST = [
    ["conv1", "bn1", "relu1"],
    ["conv2", "bn2", "relu2"],
    ["conv3", "bn3", "relu3"],
    ["conv4", "bn4", "relu4"],
]

def set_seed(seed=42):
    random.seed(seed); np.random.seed(seed)
    torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)


def lead_tag(lead_index) -> str:
    if lead_index is None:
        return "12lead"
    return {0: "lead1", 1: "lead2", 2: "lead3", 6: "lead6"}[lead_index]


def prepare_qat_model(model):
    model.qconfig = get_default_qat_qconfig("fbgemm")
    torch.ao.quantization.fuse_modules_qat(model, FUSE_LIST, inplace=True)
    prepare_qat(model, inplace=True)
    return model


def qat_finetune(model, loader, device, epochs=5, lr=1e-4):
    criterion = nn.BCEWithLogitsLoss()
    optimizer = Adam(model.parameters(), lr=lr)
    model.train()
    for ep in range(1, epochs + 1):
        total = 0.0
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            loss = criterion(model(x), y)
            loss.backward()
            optimizer.step()
            total += loss.item() * x.size(0)
        print(f"  QAT epoch {ep}/{epochs}  loss={total/len(loader.dataset):.4f}")
    return model


def export_onnx(model_int8, onnx_path, in_channels=1):
    import torch.onnx
    dummy = torch.randn(1, in_channels, 1000)
    model_int8.eval()
    torch.onnx.export(
        model_int8, dummy, onnx_path,
        opset_version=13,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
    )
    print(f"[convert] ONNX saved -> {onnx_path}")


def build_keras_model(in_channels=1, num_classes=5, fc_size=256):
    try:
        import tensorflow as tf
        from tensorflow import keras
    except ImportError:
        raise ImportError("TensorFlow not installed.")

    inp = keras.Input(shape=(1000, in_channels), name="input")
    x = inp
    x = keras.layers.Conv1D(32, 7, padding="same", use_bias=False, name="conv1")(x)
    x = keras.layers.BatchNormalization(name="bn1")(x)
    x = keras.layers.ReLU(name="relu1")(x)
    x = keras.layers.MaxPooling1D(2, name="pool1")(x)
    x = keras.layers.Conv1D(64, 5, padding="same", use_bias=False, name="conv2")(x)
    x = keras.layers.BatchNormalization(name="bn2")(x)
    x = keras.layers.ReLU(name="relu2")(x)
    x = keras.layers.MaxPooling1D(2, name="pool2")(x)
    x = keras.layers.Conv1D(128, 3, padding="same", use_bias=False, name="conv3")(x)
    x = keras.layers.BatchNormalization(name="bn3")(x)
    x = keras.layers.ReLU(name="relu3")(x)
    x = keras.layers.MaxPooling1D(2, name="pool3")(x)
    x = keras.layers.Conv1D(256, 3, padding="same", use_bias=False, name="conv4")(x)
    x = keras.layers.BatchNormalization(name="bn4")(x)
    x = keras.layers.ReLU(name="relu4")(x)
    x = keras.layers.GlobalAveragePooling1D(name="gap")(x)
    x = keras.layers.Dense(fc_size, name="fc1")(x)
    x = keras.layers.ReLU(name="relu_fc")(x)
    x = keras.layers.Dropout(0.3, name="dropout")(x)
    x = keras.layers.Dense(num_classes, name="fc2")(x)
    return keras.Model(inputs=inp, outputs=x)


def transfer_weights(pt_model, keras_model, in_channels=1):
    import tensorflow as tf

    pt_model.eval()
    sd = pt_model.state_dict()

    def t(name):
        return sd[name].detach().numpy()

    for i in range(1, 5):
        w = t(f"conv{i}.weight").transpose(2, 1, 0)
        keras_model.get_layer(f"conv{i}").set_weights([w])

    for i in range(1, 5):
        gamma = t(f"bn{i}.weight")
        beta  = t(f"bn{i}.bias")
        rmean = t(f"bn{i}.running_mean")
        rvar  = t(f"bn{i}.running_var")
        keras_model.get_layer(f"bn{i}").set_weights([gamma, beta, rmean, rvar])

    w1, b1 = t("fc1.weight").T, t("fc1.bias")
    keras_model.get_layer("fc1").set_weights([w1, b1])
    w2, b2 = t("fc2.weight").T, t("fc2.bias")
    keras_model.get_layer("fc2").set_weights([w2, b2])

    dummy_np = np.random.randn(4, in_channels, 1000).astype(np.float32)
    with torch.no_grad():
        pt_out = pt_model(torch.from_numpy(dummy_np)).numpy()
    keras_inp = dummy_np.transpose(0, 2, 1)
    keras_out = keras_model.predict(keras_inp, verbose=0)
    max_delta = float(np.abs(pt_out - keras_out).max())
    print(f"[convert] Weight transfer verified -- max output delta = {max_delta:.6f}")
    assert max_delta < 0.1, f"Weight transfer failed! max_delta={max_delta}"
    return max_delta


def convert_to_tflite_int8(keras_model, cal_data: np.ndarray, tflite_path: str):
    import tensorflow as tf

    def representative_dataset():
        for i in range(0, len(cal_data), 4):
            batch = cal_data[i:i+4].astype(np.float32)
            yield [batch]

    converter = tf.lite.TFLiteConverter.from_keras_model(keras_model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.representative_dataset = representative_dataset
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type  = tf.int8
    converter.inference_output_type = tf.int8

    tflite_model = converter.convert()
    with open(tflite_path, "wb") as f:
        f.write(tflite_model)
    size_kb = os.path.getsize(tflite_path) / 1024
    print(f"[convert] TFLite INT8 saved -> {tflite_path}  ({size_kb:.1f} KB)")
    return tflite_model


def generate_c_array(tflite_bytes: bytes, h_path: str, var_name: str = "cnn1d_model"):
    hex_data = ", ".join(f"0x{b:02x}" for b in tflite_bytes)
    content = (
        f"// Generated by convert_to_tflite.py\n"
        f"// 1D-CNN INT8 TFLite model for ESP32-WROOM-32D\n"
        f"// Model size: {len(tflite_bytes)} bytes ({len(tflite_bytes)/1024:.1f} KB)\n\n"
        f"#ifndef CNN1D_MODEL_H\n"
        f"#define CNN1D_MODEL_H\n\n"
        f"const unsigned char {var_name}[] = {{\n  {hex_data}\n}};\n"
        f"const unsigned int {var_name}_len = {len(tflite_bytes)};\n\n"
        f"#endif // CNN1D_MODEL_H\n"
    )
    with open(h_path, "w") as f:
        f.write(content)
    print(f"[convert] C array saved -> {h_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ckpt",       required=True)
    parser.add_argument("--lead",       type=int, default=0,
                        help="0=LeadI  1=LeadII  2=LeadIII  6=6lead  12=all-12")
    parser.add_argument("--qat_epochs", type=int, default=5)
    parser.add_argument("--batch",      type=int, default=64)
    parser.add_argument("--workers",    type=int, default=4)
    parser.add_argument("--data_dir",   default=DATA_DIR)
    parser.add_argument("--ckpt_dir",   default=CKPT_DIR)
    parser.add_argument("--deploy_dir", default=DEPLOY_DIR)
    parser.add_argument("--remap",      action="store_true")
    parser.add_argument("--fc_size",    type=int, default=256,
                        help="FC hidden size (256 for lead1/lead6, 128 for 12lead)")
    args = parser.parse_args()

    lead_index  = None if args.lead == 12 else args.lead
    in_channels = 12 if lead_index is None else (6 if lead_index == 6 else 1)
    tag = lead_tag(lead_index)

    set_seed()
    device = torch.device("cpu")
    print(f"[convert] lead={tag}  in_channels={in_channels}  fc_size={args.fc_size}  device={device}")

    os.makedirs(args.deploy_dir, exist_ok=True)
    os.makedirs(args.ckpt_dir, exist_ok=True)

    # 1. Load float32 model
    model = CNN1D(in_channels=in_channels, fc_size=args.fc_size)
    state = torch.load(args.ckpt, map_location="cpu")
    if args.remap:
        state = remap_cnn1d_checkpoint(state)
    model.load_state_dict(state, strict=False)
    model.train()
    print(f"[convert] Loaded {args.ckpt}")

    # 2-3. QAT fine-tuning
    model = prepare_qat_model(model)
    loaders = get_dataloaders(
        data_dir=args.data_dir,
        lead_index=lead_index,
        batch_size=args.batch,
        num_workers=args.workers,
    )
    print(f"[convert] QAT fine-tuning for {args.qat_epochs} epochs...")
    qat_finetune(model, loaders["train"], device, epochs=args.qat_epochs)

    qat_fp_path = os.path.join(args.ckpt_dir, f"cnn1d_{tag}_qat_fp.pth")
    torch.save(model.state_dict(), qat_fp_path)
    print(f"[convert] QAT float checkpoint -> {qat_fp_path}")

    # 4. Convert to real INT8
    model.eval()
    model_int8 = convert(model, inplace=False)
    int8_path  = os.path.join(args.ckpt_dir, f"cnn1d_{tag}_int8.pth")
    torch.save(model_int8.state_dict(), int8_path)
    size_kb = os.path.getsize(int8_path) / 1024
    print(f"[convert] INT8 checkpoint -> {int8_path}  ({size_kb:.1f} KB)")

    # 5. ONNX export
    onnx_path = os.path.join(args.deploy_dir, f"cnn1d_{tag}.onnx")
    export_onnx(model_int8, onnx_path, in_channels=in_channels)

    # 6-7. Keras + TFLite
    float_model = CNN1D(in_channels=in_channels, fc_size=args.fc_size)
    float_model.load_state_dict(torch.load(args.ckpt, map_location="cpu"), strict=False)
    float_model.eval()

    keras_model = build_keras_model(in_channels=in_channels, fc_size=args.fc_size)
    transfer_weights(float_model, keras_model, in_channels=in_channels)

    cal_x = []
    for x, _ in loaders["train"]:
        cal_x.append(x.numpy())
        if sum(a.shape[0] for a in cal_x) >= 200:
            break
    cal_data = np.vstack(cal_x)[:200].transpose(0, 2, 1)

    tflite_path = os.path.join(args.deploy_dir, f"cnn1d_{tag}_int8.tflite")
    tflite_bytes = convert_to_tflite_int8(keras_model, cal_data, tflite_path)

    # 8. C array
    h_path = os.path.join(args.deploy_dir, f"cnn1d_{tag}_model.h")
    generate_c_array(tflite_bytes, h_path, var_name=f"cnn1d_{tag}_model")

    print("\n[convert] Done.")
    print(f"  TFLite  : {tflite_path}")
    print(f"  C array : {h_path}")


if __name__ == "__main__":
    main()