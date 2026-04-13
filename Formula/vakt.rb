class Vakt < Formula
  desc "Secure MCP runtime — policy, audit, registry, multi-provider sync"
  homepage "https://github.com/tn819/vakt"
  version "0.9.0"

  on_macos do
    on_arm do
      url "https://github.com/tn819/vakt/releases/download/v0.9.0/vakt-0.9.0-darwin-arm64.tar.gz"
      sha256 "0004e395d16268903b8c3c5c8b92fe656e1dbea1865e2dfafc3bf3131b4a5288"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/tn819/vakt/releases/download/v0.9.0/vakt-0.9.0-linux-x86_64.tar.gz"
      sha256 "50017209609973597996f9adc5f2dac3dcba5cc4c8dd3370c87a575b24ca622f"
    end
  end

  def install
    bin.install "vakt"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vakt --version")
  end
end
