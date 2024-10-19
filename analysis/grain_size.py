import time
import subprocess

blender_path = "/home/jacques/blender/build_release/bin/blender"
test_file_path = "grain_size.blend"
env_name = "MAX_GRAIN_SIZE"

grain_size = 753_000
while grain_size < 828172:
    grain_size = 20_000
    print(f"Testing grain size: {grain_size}")
    start = time.time()
    env = {env_name: str(grain_size)}
    subprocess.run(
        [
            blender_path,
            "--background",
            test_file_path,
            "--python",
            "grain_size_script.py",
        ],
        env=env,
        stdout=subprocess.DEVNULL,
    )
    end = time.time()
    with open("grain_size_results.csv", "a") as f:
        f.write(f"{grain_size}, {end - start:.3f}\n")
    # grain_size = int(grain_size * 1.1)
    grain_size += 10000
    break
