# Use a standard Ubuntu image as the base
FROM ubuntu:22.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    clang \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set up a non-root user
RUN useradd -ms /bin/bash user
USER user
WORKDIR /home/user

# Install Rust
ENV RUSTUP_HOME=/home/user/.rustup
ENV CARGO_HOME=/home/user/.cargo
ENV PATH="/home/user/.cargo/bin:${PATH}"
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Install the SP1 toolchain
RUN mkdir -p /home/user/.sp1/bin && \
    curl -L https://raw.githubusercontent.com/succinctlabs/sp1/main/sp1up/sp1up -o /home/user/.sp1/bin/sp1up && \
    chmod +x /home/user/.sp1/bin/sp1up

RUN echo 'source /home/user/.zshenv' >> /home/user/.bashrc
ENV PATH="/home/user/.sp1/bin:${PATH}"
RUN /home/user/.sp1/bin/sp1up

# Copy the ZK program source code into the container
COPY --chown=user:user ./zk-image-poc /home/user/zk-image-poc

# Build the ZK program
RUN rm -f /home/user/zk-image-poc/Cargo.lock
RUN cd /home/user/zk-image-poc && cargo update
RUN cd /home/user/zk-image-poc && cargo prove build

# Set the default command for the container (can be overridden)
CMD ["bash"]
