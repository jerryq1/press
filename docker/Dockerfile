FROM mdd-images.tencentcloudcr.com/ops/tvbcpress-nginx:1.24.0

ARG PROJ_DIR=/data/tvbcserver/mdd
# 工作目录
WORKDIR $PROJ_DIR
# 复制代码
COPY --chown=tvbcserver:tvbcserver ./public/ .