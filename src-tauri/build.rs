fn main() {
    tauri_build::build();

    let x = 5;
    let y = x.clone();

    println!("{}", y);
}