{ pkgs }: {
  deps = with pkgs; [
    bubblewrap
    firejail
    gcc
    gnumake
    nodejs_24
    python313
    go
    time
  ];
}
